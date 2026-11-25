import http from 'node:http';
import type { ContainerInfo, ContainerState, PortMapping } from '@clearview/shared';
import type { ContainerOverride } from '../config';
import { mapLimit } from '../util';

// ---------- minimal Docker Engine API client (unix socket or tcp, e.g. a socket proxy) ----------

export class DockerClient {
  constructor(private target: string) {}

  private requestOptions(path: string): http.RequestOptions {
    if (/^(tcp|http):\/\//.test(this.target)) {
      const u = new URL(this.target.replace(/^tcp:/, 'http:'));
      return { host: u.hostname, port: Number(u.port) || 2375, path };
    }
    return { socketPath: this.target.replace(/^unix:\/\//, ''), path };
  }

  private friendly(err: NodeJS.ErrnoException): Error {
    if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED' || err.code === 'EACCES') {
      return new Error(`cannot reach Docker at ${this.target} (${err.code})`);
    }
    return err;
  }

  get<T>(path: string, timeoutMs = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = http.get({ ...this.requestOptions(path), timeout: timeoutMs }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if ((res.statusCode ?? 500) >= 400) return reject(new Error(`docker ${res.statusCode}: ${body.slice(0, 200)}`));
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error('docker returned invalid JSON'));
          }
        });
      });
      req.on('timeout', () => req.destroy(new Error('docker request timed out')));
      req.on('error', (e) => reject(this.friendly(e)));
    });
  }

  /** Calls `onEvent` for every container event. Reconnects with backoff. Returns a stop function. */
  watchEvents(onEvent: () => void): () => void {
    let stopped = false;
    let delay = 1000;
    let req: http.ClientRequest | null = null;
    let retryTimer: NodeJS.Timeout | null = null;

    const scheduleRetry = () => {
      if (stopped || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
      delay = Math.min(delay * 2, 30_000);
    };

    const connect = () => {
      if (stopped) return;
      const filters = encodeURIComponent(JSON.stringify({ type: ['container'] }));
      req = http.get(this.requestOptions(`/events?filters=${filters}`), (res) => {
        delay = 1000;
        res.on('data', () => onEvent());
        res.on('end', scheduleRetry);
        res.on('error', scheduleRetry);
      });
      req.on('error', scheduleRetry);
    };

    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      req?.destroy();
    };
  }
}

// ---------- raw API shapes (only the fields we read) ----------

export interface RawContainer {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Ports?: { IP?: string; PrivatePort: number; PublicPort?: number; Type: string }[];
  Labels?: Record<string, string> | null;
  HostConfig?: { NetworkMode?: string };
  NetworkSettings?: { Networks?: Record<string, { IPAddress?: string }> };
}

interface RawInspect {
  State?: { StartedAt?: string };
}

// ---------- pure helpers (unit tested) ----------

export function deriveState(state: string, status: string): ContainerState {
  const s = state.toLowerCase();
  if (s === 'running') {
    // check "unhealthy" first: it contains the substring "healthy"
    if (/\(unhealthy\)/.test(status)) return 'unhealthy';
    if (/\(health: starting\)/.test(status)) return 'starting';
    if (/\(healthy\)/.test(status)) return 'healthy';
    return 'running';
  }
  if (s === 'paused' || s === 'restarting' || s === 'exited' || s === 'created' || s === 'dead' || s === 'removing') return s;
  return 'exited';
}

/** Docker lists a port once per bound address (0.0.0.0 and ::). Collapse to one entry per private port. */
export function mapPorts(raw: RawContainer['Ports']): PortMapping[] {
  const seen = new Map<string, PortMapping>();
  for (const p of raw ?? []) {
    const key = `${p.PrivatePort}/${p.Type}`;
    const pub = p.PublicPort ?? null;
    const existing = seen.get(key);
    if (!existing) seen.set(key, { private: p.PrivatePort, public: pub, proto: p.Type });
    else if (existing.public === null && pub !== null) existing.public = pub;
  }
  return [...seen.values()].sort((a, b) => a.private - b.private);
}

const WEB_PORTS = [80, 8080, 8000, 3000, 443, 8443, 8096, 5000, 9000, 8888, 8123];
const TLS_PORTS = new Set([443, 8443]);

export const IP_TOKEN = '[IP]';

export interface UrlInput {
  labels: Record<string, string>;
  ports: PortMapping[];
  networkMode: string;
  networks: Record<string, { IPAddress?: string }>;
  overrideUrl?: string;
  /** LAN address of the Docker host; null leaves the literal `[IP]` token for the browser to fill in. */
  hostIp: string | null;
}

/** First usable address on a non-default network (macvlan/br0). Unreachable bridge IPs are skipped. */
function ownLanIp(i: UrlInput): string | null {
  for (const [name, net] of Object.entries(i.networks)) {
    if (name === 'bridge' || name === 'host' || name === 'none') continue;
    if (net.IPAddress) return net.IPAddress;
  }
  return null;
}

/**
 * Resolution order:
 *  1. config override / `clearview.url` label
 *  2. Unraid's `net.unraid.docker.webui` label (an explicitly empty label means "no WebUI")
 *  3. a published TCP port
 *  4. the container's own LAN IP + first exposed port
 */
export function resolveWebUrl(i: UrlInput): string | null {
  const hostToken = i.hostIp ?? IP_TOKEN;
  const publishedAny = i.ports.some((p) => p.public !== null);
  const lanIp = i.networkMode === 'host' ? null : !publishedAny ? ownLanIp(i) : null;
  const ipValue = lanIp ?? hostToken;

  const expand = (tpl: string): string =>
    tpl
      .replace(/\[PORT:(\d+)\]/gi, (_m, n: string) => {
        const priv = Number(n);
        const mapped = i.ports.find((p) => p.private === priv && p.public !== null);
        return String(mapped?.public ?? priv);
      })
      .replace(/\[IP\]/gi, ipValue);

  const explicit = i.overrideUrl?.trim() || i.labels['clearview.url']?.trim();
  if (explicit) return expand(explicit);

  if ('net.unraid.docker.webui' in i.labels) {
    const tpl = i.labels['net.unraid.docker.webui']!.trim();
    return tpl ? expand(tpl) : null;
  }

  const published = i.ports.filter((p) => p.public !== null && p.proto === 'tcp');
  if (published.length > 0) {
    const rank = (p: PortMapping) => {
      const idx = WEB_PORTS.indexOf(p.private);
      return idx === -1 ? WEB_PORTS.length : idx;
    };
    const best = [...published].sort((a, b) => rank(a) - rank(b) || a.private - b.private)[0]!;
    return `${TLS_PORTS.has(best.private) ? 'https' : 'http'}://${hostToken}:${best.public}`;
  }

  const ip = ownLanIp(i);
  const exposed = i.ports.filter((p) => p.proto === 'tcp')[0];
  if (ip && exposed) return `${TLS_PORTS.has(exposed.private) ? 'https' : 'http'}://${ip}:${exposed.private}`;
  return null;
}

export interface BuildOptions {
  hostIp: string | null;
  overrides: Record<string, ContainerOverride>;
  hide: string[];
  now: number;
}

export function toContainerInfo(raw: RawContainer, startedAt: string | null, opts: BuildOptions): ContainerInfo | null {
  const labels = raw.Labels ?? {};
  const rawName = (raw.Names[0] ?? raw.Id.slice(0, 12)).replace(/^\//, '');
  const override = opts.overrides[rawName] ?? {};

  if (labels['clearview.hide'] === 'true' || override.hide || opts.hide.includes(rawName)) return null;

  const state = deriveState(raw.State, raw.Status);
  const ports = mapPorts(raw.Ports);
  const alive = state === 'running' || state === 'healthy' || state === 'unhealthy' || state === 'starting' || state === 'paused';
  const uptimeSec = alive && startedAt ? Math.max(0, Math.floor((opts.now - Date.parse(startedAt)) / 1000)) : null;

  return {
    id: raw.Id.slice(0, 12),
    name: override.name ?? labels['clearview.name'] ?? rawName,
    image: raw.Image,
    state,
    statusText: raw.Status,
    startedAt,
    uptimeSec,
    ports,
    url: resolveWebUrl({
      labels,
      ports,
      networkMode: raw.HostConfig?.NetworkMode ?? '',
      networks: raw.NetworkSettings?.Networks ?? {},
      overrideUrl: override.url,
      hostIp: opts.hostIp,
    }),
    icon: override.icon ?? labels['clearview.icon'] ?? labels['net.unraid.docker.icon'] ?? null,
    group: override.group ?? labels['clearview.group'] ?? null,
    managed: 'net.unraid.docker.managed' in labels,
  };
}

function validStart(s: string | undefined): string | null {
  return s && !s.startsWith('0001-') ? s : null;
}

export async function collectContainers(client: DockerClient, opts: Omit<BuildOptions, 'now'>): Promise<ContainerInfo[]> {
  const list = await client.get<RawContainer[]>('/containers/json?all=true');
  const alive = list.filter((c) => c.State === 'running' || c.State === 'restarting' || c.State === 'paused');

  const started = new Map<string, string | null>();
  await mapLimit(alive, 8, async (c) => {
    try {
      const info = await client.get<RawInspect>(`/containers/${c.Id}/json`);
      started.set(c.Id, validStart(info.State?.StartedAt));
    } catch {
      started.set(c.Id, null); // a container can vanish between list and inspect
    }
  });

  const now = Date.now();
  return list
    .map((c) => toContainerInfo(c, started.get(c.Id) ?? null, { ...opts, now }))
    .filter((c): c is ContainerInfo => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
