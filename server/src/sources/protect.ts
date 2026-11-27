import type { ProtectCamera, ProtectData, ProtectEvent } from '@clearview/shared';
import type { AppConfig } from '../config';
import { HttpStatusError, httpGetter, type Getter } from './unifi';
import { openFeed, type Feed } from './ws';

// UniFi Protect through its Integration API, read only, with the same console address and API key as
// the network box. The API has no history: events are the ones heard on its live feed since the
// server started listening.
const BASE = '/proxy/protect/integration/v1';
const CAMERA_TTL_MS = 30_000;
/** a console without Protect is asked again this often, in case it gets installed */
const ABSENT_TTL_MS = 10 * 60_000;
const MAX_EVENTS = 100;
const RETRY_FIRST_MS = 5_000;
const RETRY_MAX_MS = 60_000;

export interface RawCamera {
  id: string;
  name?: string | null;
  /** model name, e.g. "UVC G5 Flex" */
  type?: string | null;
  state?: string;
  smartDetectSettings?: { objectTypes?: string[] } | null;
}

export interface RawEvent {
  id: string;
  type?: string;
  /** epoch milliseconds */
  start?: number;
  end?: number | null;
  /** the camera's id */
  device?: string;
  smartDetectTypes?: string[] | null;
}

// ---------- pure helpers (unit tested) ----------

const DETECTIONS: Record<string, string> = {
  person: 'person',
  vehicle: 'vehicle',
  package: 'package',
  licensePlate: 'license plate',
  face: 'face',
  animal: 'animal',
  alrmSmoke: 'smoke alarm',
  alrmCmonx: 'CO alarm',
  alrmSiren: 'siren',
  alrmBabyCry: 'baby crying',
  alrmSpeak: 'speech',
  alrmBark: 'barking',
  alrmBurglar: 'burglar alarm',
  alrmCarHorn: 'car horn',
  alrmGlassBreak: 'breaking glass',
};

export const detectionName = (id: string): string => DETECTIONS[id] ?? id;

/** What a camera event was about, or null for a kind of event that is not shown. */
export function describeEvent(e: RawEvent): { what: string; motionOnly: boolean } | null {
  const found = (e.smartDetectTypes ?? []).map(detectionName).join(', ');
  switch (e.type) {
    case 'ring':
      return { what: 'doorbell', motionOnly: false };
    case 'smartDetectZone':
    case 'smartDetectLine':
    case 'smartDetectLoiterZone':
      return { what: found || 'detection', motionOnly: false };
    case 'smartAudioDetect':
      return { what: found || 'sound', motionOnly: false };
    case 'motion':
      return { what: 'motion', motionOnly: true };
    default:
      return null;
  }
}

/** The recent events, built from the feed's "add" and "update" messages. */
export class EventLog {
  private events = new Map<string, RawEvent>();

  constructor(private max = MAX_EVENTS) {}

  /** Take one feed message. Anything that is not an event is ignored. */
  apply(text: string): void {
    let message: { type?: unknown; item?: Partial<RawEvent> & { modelKey?: string } };
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    const item = message?.item;
    if ((message?.type !== 'add' && message?.type !== 'update') || typeof item?.id !== 'string') return;
    // an update can be partial: keep what is already known about the event
    const next = { ...this.events.get(item.id), ...item } as RawEvent;
    if (typeof next.start !== 'number' || typeof next.device !== 'string' || !describeEvent(next)) return;
    this.events.set(next.id, next);
    if (this.events.size > this.max) {
      const oldest = this.newestFirst().at(-1)!;
      this.events.delete(oldest.id);
    }
  }

  newestFirst(): RawEvent[] {
    return [...this.events.values()].sort((a, b) => b.start! - a.start!);
  }
}

function cameraState(v: unknown): ProtectCamera['state'] {
  const s = String(v ?? '').toLowerCase();
  return s === 'connected' || s === 'connecting' || s === 'disconnected' ? s : 'unknown';
}

export function mapCameras(cameras: RawCamera[]): ProtectCamera[] {
  return cameras
    .map((c) => ({
      id: c.id,
      name: c.name || c.type || 'camera',
      model: c.type ?? '',
      state: cameraState(c.state),
      detects: (c.smartDetectSettings?.objectTypes ?? []).map(detectionName),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Events of known cameras, with the camera's name filled in. */
export function mapEvents(events: RawEvent[], cameras: ProtectCamera[]): ProtectEvent[] {
  const names = new Map(cameras.map((c) => [c.id, c.name]));
  const out: ProtectEvent[] = [];
  for (const e of events) {
    const about = describeEvent(e);
    const camera = names.get(e.device ?? '');
    if (!about || camera === undefined) continue;
    out.push({ id: e.id, cameraId: e.device!, camera, ...about, start: e.start!, end: e.end ?? null });
  }
  return out;
}

// ---------- client ----------

export type Connector = typeof openFeed;

export class ProtectSource {
  private cameras: { at: number; list: ProtectCamera[] | null } | null = null;
  private log = new EventLog();
  private feed: Feed | null = null;
  private retry: NodeJS.Timeout | null = null;
  private delay = RETRY_FIRST_MS;
  private live = false;
  private feedError: string | null = null;
  private since: number | null = null;
  private get: Getter;

  constructor(
    private cfg: NonNullable<AppConfig['unifi']>,
    get?: Getter,
    private connect: Connector = openFeed,
  ) {
    this.get = get ?? httpGetter(cfg, 6000, 'protect');
  }

  /** null when this console has no Protect */
  private async currentCameras(): Promise<ProtectCamera[] | null> {
    const known = this.cameras;
    if (known && Date.now() - known.at < (known.list ? CAMERA_TTL_MS : ABSENT_TTL_MS)) return known.list;
    let list: ProtectCamera[] | null;
    try {
      const body = await this.get(`${BASE}/cameras`);
      if (!Array.isArray(body)) throw new Error('protect: unexpected answer to the camera list');
      list = mapCameras(body as RawCamera[]);
    } catch (err) {
      if (!(err instanceof HttpStatusError && err.status === 404)) throw err;
      list = null;
    }
    this.cameras = { at: Date.now(), list };
    return list;
  }

  /** Follow the live feed, reconnecting with a growing pause when it drops. Safe to call again. */
  private listen(): void {
    if (this.feed || this.retry) return;
    this.feed = this.connect(
      `${this.cfg.url}${BASE}/subscribe/events`,
      { headers: { 'X-API-KEY': this.cfg.apiKey }, insecure: this.cfg.insecure },
      {
        onOpen: () => {
          this.live = true;
          this.feedError = null;
          this.since ??= Date.now();
          this.delay = RETRY_FIRST_MS;
        },
        onMessage: (text) => this.log.apply(text),
        onClose: (reason) => {
          this.feed = null;
          this.live = false;
          this.feedError = reason;
          this.retry = setTimeout(() => {
            this.retry = null;
            this.listen();
          }, this.delay);
          this.retry.unref();
          this.delay = Math.min(this.delay * 2, RETRY_MAX_MS);
        },
      },
    );
  }

  async collect(): Promise<ProtectData> {
    const cameras = await this.currentCameras();
    if (!cameras) return { available: false, cameras: [], events: [], live: false, feedError: null, since: null };
    this.listen();
    return {
      available: true,
      cameras,
      events: mapEvents(this.log.newestFirst(), cameras),
      live: this.live,
      feedError: this.feedError,
      since: this.since,
    };
  }
}
