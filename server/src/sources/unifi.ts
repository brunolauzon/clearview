import http from 'node:http';
import https from 'node:https';
import type { UnifiData } from '@clearview/shared';
import type { AppConfig } from '../config';
import { round1 } from '../util';

// UniFi Network Integration API on a UniFi OS console (UDM, UDR, Cloud Gateway, Cloud Key), read only.
// Create the key in UniFi Network > Settings > Control Plane > Integrations.
// Field names follow the API as typed by the open source `unifly` client. Model names, features and
// statistics keys were checked against a Dream Machine Pro SE; other consoles and versions may differ.
const BASE = '/proxy/network/integration/v1';
const PAGE = 200;
const MAX_PAGES = 25;
const SITE_TTL_MS = 10 * 60_000;

export interface Page<T> {
  totalCount?: number;
  count?: number;
  data?: T[];
}

export interface RawSite {
  id: string;
  name?: string;
  internalReference?: string;
}

export interface RawDevice {
  id: string;
  name?: string;
  model?: string;
  state?: string;
  features?: string[];
}

export interface RawClient {
  type?: string;
  access?: { type?: string } | null;
}

export interface RawStats {
  uptimeSec?: number | null;
  cpuUtilizationPct?: number | null;
  memoryUtilizationPct?: number | null;
  uplink?: { txRateBps?: number; rxRateBps?: number } | null;
}

/** GET one API path and return the parsed JSON. Replaced in tests. */
export type Getter = (path: string) => Promise<unknown>;

const CERT_ERRORS = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED',
]);

export class HttpStatusError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Consoles ship with self-signed certificates, so verification can be switched off, but only on request.
 * `label` names the application in error messages: the same getter serves Protect.
 */
export function httpGetter(cfg: NonNullable<AppConfig['unifi']>, timeoutMs = 6000, label = 'unifi'): Getter {
  return (path) =>
    new Promise((resolve, reject) => {
      const url = new URL(`${cfg.url}${path}`);
      const headers = { 'X-API-KEY': cfg.apiKey, Accept: 'application/json' };
      const done = (res: http.IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status === 401 || status === 403) return reject(new HttpStatusError(`${label}: auth failed (HTTP ${status}), check the API key`, status));
          if (status >= 400 || status === 0) return reject(new HttpStatusError(`${label}: HTTP ${status}`, status));
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            reject(new Error(`${label}: response was not JSON, check UNIFI_URL points at the console`));
          }
        });
      };
      const req =
        url.protocol === 'https:'
          ? https.get(url, { headers, timeout: timeoutMs, rejectUnauthorized: !cfg.insecure }, done)
          : http.get(url, { headers, timeout: timeoutMs }, done);
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code && CERT_ERRORS.has(err.code)) {
          return reject(new Error(`${label}: the console certificate is not trusted. Set UNIFI_INSECURE=1 to accept it.`));
        }
        reject(new Error(`${label}: cannot connect (${err.code ?? err.message})`));
      });
    });
}

// ---------- pure helpers (unit tested) ----------

export function pickSite(sites: RawSite[], wanted: string | null): RawSite | null {
  if (wanted) {
    const w = wanted.toLowerCase();
    return sites.find((s) => s.name?.toLowerCase() === w || s.internalReference?.toLowerCase() === w) ?? null;
  }
  return sites.find((s) => s.internalReference === 'default') ?? sites[0] ?? null;
}

// `model` can be a short code ("UCG-Ultra") or a product name ("UniFi Dream Machine PRO SE").
const GATEWAY_CODES = /^(UGW|USG|UDM|UDR|UDW|UXG|UCG|EFG)/i;
const GATEWAY_NAMES = /\b(dream (machine|router|wall)|gateway|express)\b/i;

/**
 * The gateway is recognised by its model or by what it does: a gateway may list no routing feature at all.
 * An online one wins, and an Express comes last because it can also serve as a plain access point.
 */
export function findGateway(devices: RawDevice[]): RawDevice | null {
  const isGateway = (d: RawDevice) => {
    const f = d.features ?? [];
    const model = d.model ?? '';
    return GATEWAY_CODES.test(model) || GATEWAY_NAMES.test(model) || f.includes('gateway') || (f.includes('routing') && f.includes('switching'));
  };
  const rank = (d: RawDevice) => (d.state === 'ONLINE' ? 0 : 2) + (/\bexpress\b/i.test(d.model ?? '') ? 1 : 0);
  return devices.filter(isGateway).sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export function countClients(clients: RawClient[]): UnifiData['clients'] {
  const out = { total: clients.length, wired: 0, wireless: 0, vpn: 0, guests: 0 };
  for (const c of clients) {
    if (c.type === 'WIRED') out.wired++;
    else if (c.type === 'WIRELESS') out.wireless++;
    else if (c.type === 'VPN' || c.type === 'TELEPORT') out.vpn++;
    if (c.access?.type === 'GUEST') out.guests++;
  }
  return out;
}

export function summariseDevices(devices: RawDevice[]): UnifiData['devices'] {
  const problems = devices
    .filter((d) => d.state !== 'ONLINE')
    .map((d) => ({ name: d.name || d.model || d.id, state: (d.state ?? 'unknown').toLowerCase().replace(/_/g, ' ') }));
  return { total: devices.length, online: devices.length - problems.length, problems };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function mapGateway(device: RawDevice, stats: RawStats | null): NonNullable<UnifiData['gateway']> {
  const pct = (v: unknown) => (num(v) === null ? null : round1(num(v)!));
  return {
    name: device.name || device.model || 'gateway',
    model: device.model ?? '',
    cpuPct: pct(stats?.cpuUtilizationPct),
    memPct: pct(stats?.memoryUtilizationPct),
    uptimeSec: num(stats?.uptimeSec),
    // Read as bits per second, matching Ubiquiti's "Mbps" naming elsewhere. If the dashboard shows
    // one eighth of what UniFi shows, this API version reports bytes: multiply these two by 8.
    rxBps: num(stats?.uplink?.rxRateBps),
    txBps: num(stats?.uplink?.txRateBps),
  };
}

// ---------- client ----------

export class UnifiSource {
  private site: { at: number; value: RawSite } | null = null;
  private get: Getter;

  constructor(
    private cfg: NonNullable<AppConfig['unifi']>,
    get?: Getter,
  ) {
    this.get = get ?? httpGetter(cfg);
  }

  /** Follow offset/limit pages until the reported total is reached. */
  private async all<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = (await this.get(`${path}?offset=${out.length}&limit=${PAGE}`)) as Page<T>;
      const items = body.data ?? [];
      out.push(...items);
      if (items.length === 0 || out.length >= (body.totalCount ?? out.length)) break;
    }
    return out;
  }

  private async currentSite(): Promise<RawSite> {
    if (this.site && Date.now() - this.site.at < SITE_TTL_MS) return this.site.value;
    const sites = await this.all<RawSite>(`${BASE}/sites`);
    const site = pickSite(sites, this.cfg.site);
    if (!site) {
      const names = sites.map((s) => s.name).join(', ') || 'none';
      throw new Error(this.cfg.site ? `unifi: no site "${this.cfg.site}" (found: ${names})` : 'unifi: the console reported no sites');
    }
    this.site = { at: Date.now(), value: site };
    return site;
  }

  async collect(): Promise<UnifiData> {
    const site = await this.currentSite();
    const root = `${BASE}/sites/${encodeURIComponent(site.id)}`;
    const [devices, clients] = await Promise.all([this.all<RawDevice>(`${root}/devices`), this.all<RawClient>(`${root}/clients`)]);

    const gateway = findGateway(devices);
    let stats: RawStats | null = null;
    if (gateway?.state === 'ONLINE') {
      // throughput is a bonus: still show devices and clients if this one call fails
      stats = (await this.get(`${root}/devices/${encodeURIComponent(gateway.id)}/statistics/latest`).catch(() => null)) as RawStats | null;
    }

    return {
      site: site.name ?? site.internalReference ?? 'default',
      gateway: gateway ? mapGateway(gateway, stats) : null,
      clients: countClients(clients),
      devices: summariseDevices(devices),
    };
  }
}
