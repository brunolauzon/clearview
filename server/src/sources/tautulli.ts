import type {
  PlexAddedItem,
  PlexData,
  PlexHistoryItem,
  PlexLibrary,
  PlexStream,
  PlexTopStat,
} from '@clearview/shared';
import type { AppConfig } from '../config';
import { fetchJson } from '../http';

type Obj = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

// ---------- mappers (pure, unit tested) ----------

export function mapDecision(v: unknown): PlexStream['decision'] {
  switch (str(v).toLowerCase()) {
    case 'direct play':
      return 'direct play';
    case 'copy': // Tautulli reports direct stream as "copy"
    case 'direct stream':
      return 'direct stream';
    case 'transcode':
      return 'transcode';
    default:
      return 'unknown';
  }
}

function mapState(v: unknown): PlexStream['state'] {
  const s = str(v).toLowerCase();
  return s === 'playing' || s === 'paused' || s === 'buffering' ? s : 'unknown';
}

function mapLocation(v: unknown): PlexStream['location'] {
  const s = str(v).toLowerCase();
  return s === 'lan' || s === 'wan' ? s : 'unknown';
}

export function mapActivity(data: Obj): Pick<
  PlexData,
  'streams' | 'streamCount' | 'transcodeCount' | 'totalBandwidthKbps' | 'lanBandwidthKbps' | 'wanBandwidthKbps'
> {
  const sessions = (Array.isArray(data.sessions) ? data.sessions : []) as Obj[];
  const streams: PlexStream[] = sessions.map((s, i) => ({
    id: str(s.session_key ?? s.session_id ?? i),
    user: str(s.friendly_name || s.user) || 'unknown',
    title: str(s.full_title || s.title) || 'unknown',
    mediaType: str(s.media_type),
    player: str(s.player || s.product),
    platform: str(s.platform),
    state: mapState(s.state),
    decision: mapDecision(s.transcode_decision),
    quality: str(s.quality_profile || s.stream_video_full_resolution) || null,
    progressPct: Math.min(100, Math.max(0, num(s.progress_percent))),
    bandwidthKbps: num(s.bandwidth ?? s.stream_bitrate),
    location: mapLocation(s.location),
  }));
  return {
    streams,
    streamCount: num(data.stream_count) || streams.length,
    transcodeCount: num(data.stream_count_transcode) || streams.filter((s) => s.decision === 'transcode').length,
    totalBandwidthKbps: num(data.total_bandwidth),
    lanBandwidthKbps: num(data.lan_bandwidth),
    wanBandwidthKbps: num(data.wan_bandwidth),
  };
}

export function mapLibraries(data: unknown): PlexLibrary[] {
  return ((Array.isArray(data) ? data : []) as Obj[]).map((l) => {
    const type = str(l.section_type);
    const child = num(l.child_count);
    return {
      name: str(l.section_name),
      type,
      count: num(l.count),
      childCount: type !== 'movie' && child > 0 ? child : null,
    };
  });
}

export function mapHistory(data: Obj): PlexHistoryItem[] {
  return ((Array.isArray(data.data) ? data.data : []) as Obj[]).map((h) => ({
    user: str(h.friendly_name || h.user),
    title: str(h.full_title || h.title),
    mediaType: str(h.media_type),
    player: str(h.player),
    stoppedAt: num(h.stopped),
    percentComplete: num(h.percent_complete),
  }));
}

/** One readable name per new item. Plex groups new episodes into a season or a whole show. */
function addedTitle(r: Obj): string {
  const title = str(r.title);
  const join = (...parts: string[]) => parts.filter(Boolean).join(' - ');
  const tag = (letter: string, v: unknown) => (str(v) ? `${letter}${str(v).padStart(2, '0')}` : '');
  switch (str(r.media_type)) {
    case 'movie':
      return title && str(r.year) ? `${title} (${str(r.year)})` : title;
    case 'episode': {
      const number = tag('S', r.parent_media_index) + tag('E', r.media_index);
      return join([str(r.grandparent_title), number].filter(Boolean).join(' '), title);
    }
    case 'season':
    case 'album':
      return join(str(r.parent_title), title);
    case 'track':
      return join(str(r.grandparent_title), title);
    default:
      return title;
  }
}

export function mapRecentlyAdded(data: Obj): PlexAddedItem[] {
  return ((Array.isArray(data.recently_added) ? data.recently_added : []) as Obj[])
    .map((r, i) => ({
      id: str(r.rating_key) || String(i),
      title: addedTitle(r) || str(r.full_title) || 'unknown',
      mediaType: str(r.media_type),
      library: str(r.library_name),
      addedAt: num(r.added_at),
    }))
    .sort((a, b) => b.addedAt - a.addedAt);
}

const TOP_STATS: Record<string, { title: string; label: (r: Obj) => string }> = {
  top_users: { title: 'top users', label: (r) => str(r.friendly_name || r.user) },
  top_movies: { title: 'top movies', label: (r) => str(r.title) },
  top_tv: { title: 'top shows', label: (r) => str(r.title) },
};

export function mapHomeStats(data: unknown): PlexTopStat[] {
  const out: PlexTopStat[] = [];
  for (const block of (Array.isArray(data) ? data : []) as Obj[]) {
    const def = TOP_STATS[str(block.stat_id)];
    if (!def) continue;
    const rows = ((Array.isArray(block.rows) ? block.rows : []) as Obj[]).slice(0, 5).map((r) => ({
      label: def.label(r),
      plays: num(r.total_plays),
    }));
    out.push({ id: str(block.stat_id), title: def.title, rows });
  }
  // stable display order
  const order = Object.keys(TOP_STATS);
  return out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

// ---------- client ----------

interface TautulliEnvelope<T> {
  response: { result: string; message?: string | null; data: T };
}

const SLOW_TTL_MS = 60_000;

export class TautulliSource {
  private slow: {
    at: number;
    libraries: PlexLibrary[];
    history: PlexHistoryItem[];
    recent: PlexAddedItem[];
    top: PlexTopStat[];
  } | null = null;

  constructor(private cfg: NonNullable<AppConfig['tautulli']>) {}

  private async api<T>(cmd: string, params: Record<string, string> = {}): Promise<T> {
    const qs = new URLSearchParams({ apikey: this.cfg.apiKey, cmd, ...params });
    const body = await fetchJson<TautulliEnvelope<T>>('tautulli', `${this.cfg.url}/api/v2?${qs}`);
    if (body.response.result !== 'success') throw new Error(`tautulli: ${body.response.message ?? 'request failed'}`);
    return body.response.data;
  }

  /** Libraries, history, new additions and top stats change slowly: refresh at most once a minute, keep stale values on error. */
  private async slowData(): Promise<NonNullable<TautulliSource['slow']>> {
    if (this.slow && Date.now() - this.slow.at < SLOW_TTL_MS) return this.slow;
    try {
      const [libraries, history, top, recent] = await Promise.all([
        this.api<unknown>('get_libraries'),
        this.api<Obj>('get_history', { length: '8' }),
        this.api<unknown>('get_home_stats', { time_range: '30', stats_type: 'plays', stats_count: '5' }),
        // a bonus: if this one fails, keep the last list and still report everything else
        this.api<Obj>('get_recently_added', { count: '10' })
          .then(mapRecentlyAdded)
          .catch(() => this.slow?.recent ?? []),
      ]);
      this.slow = { at: Date.now(), libraries: mapLibraries(libraries), history: mapHistory(history), recent, top: mapHomeStats(top) };
    } catch (err) {
      if (!this.slow) throw err;
      this.slow.at = Date.now(); // back off, serve stale
    }
    return this.slow!;
  }

  async collect(): Promise<PlexData> {
    const [activity, slow] = await Promise.all([this.api<Obj>('get_activity'), this.slowData()]);
    return { ...mapActivity(activity), libraries: slow.libraries, history: slow.history, recent: slow.recent, top: slow.top };
  }
}
