import type { ActiveTorrent, TorrentData } from '@clearview/shared';
import type { AppConfig } from '../config';
import { clamp, round1 } from '../util';

// Deluge 2.x web UI, JSON-RPC on /json. Only the web password is needed. The one change this ever
// makes is connecting the web UI to its daemon when it is disconnected and there is exactly one.

const KEYS = ['name', 'state', 'progress', 'download_payload_rate', 'eta', 'total_wanted'];
const MAX_ACTIVE = 5;
const NOT_AUTHENTICATED = 1;

interface RpcResponse {
  result: unknown;
  error: { message?: string; code?: number } | null;
}

export interface RawTorrent {
  name?: string;
  state?: string;
  progress?: number;
  download_payload_rate?: number;
  eta?: number;
  total_wanted?: number;
}

export interface RawUpdate {
  connected?: boolean;
  torrents?: Record<string, RawTorrent> | null;
  stats?: { download_rate?: number; upload_rate?: number; free_space?: number } | null;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function mapUpdate(raw: RawUpdate): TorrentData {
  const torrents = Object.values(raw.torrents ?? {});
  const counts = { total: torrents.length, downloading: 0, seeding: 0, paused: 0, queued: 0, checking: 0, error: 0 };
  for (const t of torrents) {
    switch (t.state) {
      case 'Downloading':
        counts.downloading++;
        break;
      case 'Seeding':
        counts.seeding++;
        break;
      case 'Paused':
        counts.paused++;
        break;
      case 'Queued':
        counts.queued++;
        break;
      case 'Checking':
      case 'Allocating':
      case 'Moving':
        counts.checking++;
        break;
      case 'Error':
        counts.error++;
        break;
    }
  }

  const active: ActiveTorrent[] = torrents
    .filter((t) => t.state === 'Downloading')
    .sort((a, b) => num(b.download_payload_rate) - num(a.download_payload_rate) || num(b.progress) - num(a.progress))
    .slice(0, MAX_ACTIVE)
    .map((t) => ({
      name: t.name ?? 'unknown',
      progressPct: round1(clamp(num(t.progress), 0, 100)),
      downloadBytesPerSec: num(t.download_payload_rate),
      // Deluge reports 0 when there is nothing to estimate and -1 for "more than a year"
      etaSec: num(t.eta) > 0 ? num(t.eta) : null,
      sizeBytes: num(t.total_wanted),
    }));

  const free = raw.stats?.free_space;
  return {
    downloadBytesPerSec: num(raw.stats?.download_rate),
    uploadBytesPerSec: num(raw.stats?.upload_rate),
    freeBytes: typeof free === 'number' && free >= 0 ? free : null,
    counts,
    active,
  };
}

export class DelugeSource {
  private cookie: string | null = null;
  private id = 0;

  constructor(private cfg: NonNullable<AppConfig['deluge']>) {}

  /** One JSON-RPC call. Never puts the password or cookie into an error message. */
  private async post(method: string, params: unknown[]): Promise<{ body: RpcResponse; cookies: string[] }> {
    let res: Response;
    try {
      res = await fetch(`${this.cfg.url}/json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
        body: JSON.stringify({ method, params, id: ++this.id }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      const e = err as Error & { cause?: { code?: string } };
      if (e.name === 'TimeoutError') throw new Error('deluge: timed out');
      throw new Error(`deluge: cannot connect${e.cause?.code ? ` (${e.cause.code})` : ''}`);
    }
    if (!res.ok) throw new Error(`deluge: HTTP ${res.status}`);
    let body: RpcResponse;
    try {
      body = (await res.json()) as RpcResponse;
    } catch {
      throw new Error('deluge: response was not JSON, check DELUGE_URL points at the web UI');
    }
    return { body, cookies: res.headers.getSetCookie() };
  }

  private async login(): Promise<void> {
    this.cookie = null;
    const { body, cookies } = await this.post('auth.login', [this.cfg.password]);
    if (body.result !== true) throw new Error('deluge: wrong password');
    const session = cookies.map((c) => c.split(';')[0]!).find((c) => c.startsWith('_session_id='));
    if (!session) throw new Error('deluge: login succeeded but no session cookie was returned');
    this.cookie = session;
  }

  /** Calls a method, logging in first or again when the session has expired. */
  private async call<T>(method: string, params: unknown[] = [], retry = true): Promise<T> {
    if (!this.cookie) await this.login();
    const { body } = await this.post(method, params);
    if (body.error) {
      if (body.error.code === NOT_AUTHENTICATED && retry) {
        this.cookie = null;
        return this.call<T>(method, params, false);
      }
      throw new Error(`deluge: ${body.error.message ?? 'request failed'}`);
    }
    return body.result as T;
  }

  private async ensureConnected(): Promise<void> {
    if (await this.call<boolean>('web.connected')) return;
    const hosts = (await this.call<unknown[][]>('web.get_hosts')) ?? [];
    if (hosts.length !== 1) {
      throw new Error('deluge: the web UI is not connected to a daemon. Connect it in Deluge (Connection Manager).');
    }
    await this.call('web.connect', [hosts[0]![0]]);
    if (!(await this.call<boolean>('web.connected'))) throw new Error('deluge: the web UI could not connect to its daemon');
  }

  async collect(): Promise<TorrentData> {
    let update = await this.call<RawUpdate>('web.update_ui', [KEYS, {}]);
    if (!update.connected) {
      await this.ensureConnected();
      update = await this.call<RawUpdate>('web.update_ui', [KEYS, {}]);
      if (!update.connected) throw new Error('deluge: the web UI is not connected to a daemon');
    }
    return mapUpdate(update);
  }
}
