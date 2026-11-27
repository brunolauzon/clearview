// Types only. Both server and web import these with `import type`, so nothing here exists at runtime.

/** Envelope for every data source. `data` keeps the last good value when a refresh fails. */
export interface Snapshot<T> {
  /** false when the source has no config (e.g. no GRAFANA_URL). */
  configured: boolean;
  ok: boolean;
  error: string | null;
  /** epoch ms of the last collection attempt */
  at: number;
  data: T | null;
}

export interface Meta {
  version: string;
  title: string | null;
  demo: boolean;
  /** Non-null when the server was told its LAN address; clients substitute `[IP]` with this. */
  hostIp: string | null;
  /** container categories in the order they should be listed */
  groups: string[];
  /** colour theme id, or null for the built-in one */
  theme: string | null;
  /** #rrggbb overrides of the theme's background and accent, or null */
  background: string | null;
  accent: string | null;
  tautulliUrl: string | null;
  grafanaUrl: string | null;
}

// ---------- host ----------

export interface DiskInfo {
  name: string;
  mount: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPct: number;
}

export interface HostStats {
  hostname: string;
  platform: string;
  uptimeSec: number;
  cpuPct: number;
  cpuCores: number;
  load: [number, number, number];
  mem: { totalBytes: number; usedBytes: number; usedPct: number };
  swap: { totalBytes: number; usedBytes: number; usedPct: number } | null;
  disks: DiskInfo[];
}

// ---------- docker ----------

export type ContainerState =
  | 'running'
  | 'healthy'
  | 'unhealthy'
  | 'starting'
  | 'paused'
  | 'restarting'
  | 'exited'
  | 'created'
  | 'dead'
  | 'removing';

export interface PortMapping {
  private: number;
  public: number | null;
  proto: string;
}

export interface ContainerInfo {
  id: string;
  /** Docker's own container name. Config entries (categories, overrides, hide) are keyed by this. */
  rawName: string;
  /** what to show: a config override or label if set, else rawName */
  name: string;
  image: string;
  state: ContainerState;
  /** Docker's own status string, e.g. "Up 3 hours (healthy)" */
  statusText: string;
  startedAt: string | null;
  uptimeSec: number | null;
  ports: PortMapping[];
  /** May contain the literal token `[IP]` when the server has no HOST_IP; clients substitute it. */
  url: string | null;
  icon: string | null;
  /** category, e.g. "Media"; null when the container is not in any */
  group: string | null;
  /** true when the container carries Unraid's `net.unraid.docker.managed` label */
  managed: boolean;
}

/** Live usage for one running container, keyed by ContainerInfo.id. */
export interface ContainerStats {
  /** percent of one CPU core, like `docker stats` (can exceed 100); null until two samples exist */
  cpuPct: number | null;
  /** memory in use, excluding reclaimable page cache, like `docker stats` */
  memBytes: number;
  /** the container's memory limit, or the host's RAM when unlimited */
  memLimitBytes: number;
  memPct: number;
}

// ---------- alerts (Grafana) ----------

export type AlertSeverity = 'critical' | 'warning' | 'info' | 'unknown';

export interface AlertInfo {
  id: string;
  name: string;
  severity: AlertSeverity;
  startsAt: string;
  summary: string | null;
  url: string | null;
  labels: Record<string, string>;
}

// ---------- plex (Tautulli) ----------

export interface PlexStream {
  id: string;
  user: string;
  title: string;
  mediaType: string;
  player: string;
  platform: string;
  state: 'playing' | 'paused' | 'buffering' | 'unknown';
  decision: 'direct play' | 'direct stream' | 'transcode' | 'unknown';
  quality: string | null;
  progressPct: number;
  bandwidthKbps: number;
  location: 'lan' | 'wan' | 'unknown';
}

export interface PlexLibrary {
  name: string;
  type: string;
  count: number;
  /** episodes for shows, tracks for music, etc. */
  childCount: number | null;
}

export interface PlexHistoryItem {
  user: string;
  title: string;
  mediaType: string;
  player: string;
  /** epoch seconds */
  stoppedAt: number;
  percentComplete: number;
}

export interface PlexTopStat {
  id: string;
  title: string;
  rows: { label: string; plays: number }[];
}

export interface PlexAddedItem {
  id: string;
  /** "Arrival (2016)", "Severance S02E01 - Title", "Andor - Season 2" */
  title: string;
  mediaType: string;
  library: string;
  /** epoch seconds */
  addedAt: number;
}

export interface PlexData {
  streams: PlexStream[];
  streamCount: number;
  transcodeCount: number;
  totalBandwidthKbps: number;
  lanBandwidthKbps: number;
  wanBandwidthKbps: number;
  libraries: PlexLibrary[];
  history: PlexHistoryItem[];
  /** newest first */
  recent: PlexAddedItem[];
  top: PlexTopStat[];
}

// ---------- links ----------

export type LinkCheck = 'http' | 'tcp' | 'none';

export interface LinkInfo {
  name: string;
  url: string;
  group: string;
  icon: string | null;
  description: string | null;
  check: LinkCheck;
  /** null when check is `none` or the first probe has not finished */
  up: boolean | null;
  latencyMs: number | null;
}

// ---------- weather and stocks (header) ----------

export type Units = 'metric' | 'imperial';

export interface WeatherConfig {
  /** a city ("Paris", "London, CA") or "latitude,longitude" */
  location: string;
  units: Units;
}

export interface WeatherData {
  place: string;
  temp: number;
  unit: 'C' | 'F';
  /** WMO weather interpretation code */
  code: number;
  summary: string;
  isDay: boolean;
  high: number | null;
  low: number | null;
}

export interface Quote {
  symbol: string;
  name: string | null;
  price: number | null;
  /** today's move against the previous close, in the quote's currency */
  change: number | null;
  changePct: number | null;
  currency: string | null;
  /** why there is no price for this symbol */
  error: string | null;
}

// ---------- network (UniFi console) ----------

export interface UnifiData {
  site: string;
  /** null when no gateway could be identified among the site's devices */
  gateway: {
    name: string;
    model: string;
    cpuPct: number | null;
    memPct: number | null;
    uptimeSec: number | null;
    /** WAN throughput in bits per second */
    rxBps: number | null;
    txBps: number | null;
  } | null;
  clients: { total: number; wired: number; wireless: number; vpn: number; guests: number };
  devices: { total: number; online: number; problems: { name: string; state: string }[] };
}

// ---------- torrents (Deluge) ----------

export interface ActiveTorrent {
  name: string;
  progressPct: number;
  downloadBytesPerSec: number;
  /** null when Deluge has no estimate */
  etaSec: number | null;
  sizeBytes: number;
}

export interface TorrentData {
  downloadBytesPerSec: number;
  uploadBytesPerSec: number;
  freeBytes: number | null;
  counts: { total: number; downloading: number; seeding: number; paused: number; queued: number; checking: number; error: number };
  /** the downloading torrents, fastest first */
  active: ActiveTorrent[];
}

// ---------- editable config (clearview.yaml) ----------

export interface ConfigLink {
  name: string;
  url: string;
  group: string;
  check: LinkCheck;
  description?: string;
  icon?: string;
}

export interface ConfigOverride {
  name?: string;
  url?: string;
  icon?: string;
  group?: string;
  hide?: boolean;
}

export interface ConfigGroup {
  name: string;
  /** container names; `*` matches any run of characters */
  containers: string[];
}

export interface ConfigDisk {
  name: string;
  path: string;
}

/** The editable part of the config as the UI sees it. Category order is the array order. */
export interface FileConfig {
  /** local weather in the header; unset hides it */
  weather?: WeatherConfig;
  /** stock symbols shown in the header, e.g. AAPL, ^GSPC, SHOP.TO */
  stocks?: string[];
  title?: string;
  /** colour theme id from themes.ts; unset means the built-in one */
  theme?: string;
  /** background colour as #rrggbb, replacing the theme's */
  background?: string;
  /** accent colour as #rrggbb, replacing the theme's */
  accent?: string;
  /** lower-case letter -> web address it opens */
  shortcuts?: Record<string, string>;
  links: ConfigLink[];
  groups: ConfigGroup[];
  hide: string[];
  overrides: Record<string, ConfigOverride>;
  disks?: ConfigDisk[];
}

export interface ConfigIssue {
  path: string;
  message: string;
}

export interface ConfigState {
  config: FileConfig;
  /** the file's text exactly as stored; empty when there is no file yet */
  yaml: string;
  /** changes whenever the file's content does; sent back with every save so concurrent edits are caught */
  version: string;
  path: string;
  writable: boolean;
  /** why editing is off (when writable is false) */
  readOnlyReason: string | null;
  /** editing works but something is risky, e.g. the folder is not a mounted volume */
  warning: string | null;
  /** false in demo mode: edits apply live but are not written anywhere */
  persisted: boolean;
  /** the file on disk failed to parse; the last good config is still in use */
  loadError: string | null;
}
