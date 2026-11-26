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

export interface PlexData {
  streams: PlexStream[];
  streamCount: number;
  transcodeCount: number;
  totalBandwidthKbps: number;
  lanBandwidthKbps: number;
  wanBandwidthKbps: number;
  libraries: PlexLibrary[];
  history: PlexHistoryItem[];
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
