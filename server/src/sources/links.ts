import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { LinkInfo } from '@clearview/shared';
import type { LinkConfig } from '../config';
import { mapLimit } from '../util';

const TIMEOUT_MS = 3000;

/** Any HTTP response counts as up (401, 404 and redirects included). LAN devices often have self-signed certs. */
function probeHttp(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const done = (res: http.IncomingMessage) => {
      res.destroy();
      resolve();
    };
    const req =
      u.protocol === 'https:'
        ? https.request(u, { method: 'GET', timeout: TIMEOUT_MS, rejectUnauthorized: false, headers: { 'User-Agent': 'clearview' } }, done)
        : http.request(u, { method: 'GET', timeout: TIMEOUT_MS, headers: { 'User-Agent': 'clearview' } }, done);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

function probeTcp(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    const sock = net.connect({ host: u.hostname, port, timeout: TIMEOUT_MS });
    sock.on('connect', () => {
      sock.destroy();
      resolve();
    });
    sock.on('timeout', () => {
      sock.destroy();
      reject(new Error('timeout'));
    });
    sock.on('error', reject);
  });
}

export class LinkProber {
  private results = new Map<string, { up: boolean; latencyMs: number }>();

  constructor(private links: LinkConfig[]) {}

  /** Replace the list after a config change. Results are kept per address, so unchanged links keep their status. */
  setLinks(links: LinkConfig[]): void {
    this.links = links;
  }

  async probeAll(): Promise<void> {
    await mapLimit(this.links, 8, async (l) => {
      if (l.check === 'none') return;
      const start = performance.now();
      try {
        await (l.check === 'tcp' ? probeTcp(l.url) : probeHttp(l.url));
        this.results.set(l.url, { up: true, latencyMs: Math.round(performance.now() - start) });
      } catch {
        this.results.set(l.url, { up: false, latencyMs: 0 });
      }
    });
  }

  snapshot(): LinkInfo[] {
    return this.links
      .map((l) => {
        const r = this.results.get(l.url);
        return {
          name: l.name,
          url: l.url,
          group: l.group,
          icon: l.icon ?? null,
          description: l.description ?? null,
          check: l.check,
          up: l.check === 'none' || !r ? null : r.up,
          latencyMs: r?.up ? r.latencyMs : null,
        };
      })
      .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  }
}
