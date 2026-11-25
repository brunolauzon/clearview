import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  collectContainers,
  deriveState,
  DockerClient,
  mapPorts,
  resolveWebUrl,
  toContainerInfo,
  type RawContainer,
  type UrlInput,
} from './docker';

const base: UrlInput = { labels: {}, ports: [], networkMode: 'bridge', networks: {}, hostIp: '192.168.1.10' };

describe('resolveWebUrl', () => {
  it('expands Unraid [IP] and [PORT:n] using the published port', () => {
    const url = resolveWebUrl({
      ...base,
      labels: { 'net.unraid.docker.webui': 'http://[IP]:[PORT:8989]/' },
      ports: [{ private: 8989, public: 8990, proto: 'tcp' }],
    });
    expect(url).toBe('http://192.168.1.10:8990/');
  });

  it('leaves [IP] for the browser when HOST_IP is not set', () => {
    const url = resolveWebUrl({
      ...base,
      hostIp: null,
      labels: { 'net.unraid.docker.webui': 'http://[IP]:[PORT:80]/admin' },
      ports: [{ private: 80, public: 8080, proto: 'tcp' }],
    });
    expect(url).toBe('http://[IP]:8080/admin');
  });

  it('treats an explicitly empty Unraid label as "no WebUI"', () => {
    const url = resolveWebUrl({
      ...base,
      labels: { 'net.unraid.docker.webui': '' },
      ports: [{ private: 3306, public: 3306, proto: 'tcp' }],
    });
    expect(url).toBeNull();
  });

  it('prefers config override, then clearview.url, over the Unraid label', () => {
    const labels = { 'net.unraid.docker.webui': 'http://[IP]:1/', 'clearview.url': 'https://label.example/' };
    expect(resolveWebUrl({ ...base, labels })).toBe('https://label.example/');
    expect(resolveWebUrl({ ...base, labels, overrideUrl: 'https://cfg.example/' })).toBe('https://cfg.example/');
  });

  it('uses the private port number on host networking', () => {
    const url = resolveWebUrl({
      ...base,
      networkMode: 'host',
      labels: { 'net.unraid.docker.webui': 'http://[IP]:[PORT:8123]' },
    });
    expect(url).toBe('http://192.168.1.10:8123');
  });

  it('uses the container LAN IP on br0 when nothing is published', () => {
    const url = resolveWebUrl({
      ...base,
      networkMode: 'br0',
      networks: { br0: { IPAddress: '192.168.1.50' } },
      labels: { 'net.unraid.docker.webui': 'http://[IP]:[PORT:80]/' },
    });
    expect(url).toBe('http://192.168.1.50:80/');
  });

  it('falls back to a published port, preferring common web ports and https for 443', () => {
    expect(
      resolveWebUrl({
        ...base,
        ports: [
          { private: 9999, public: 19999, proto: 'tcp' },
          { private: 80, public: 8081, proto: 'tcp' },
        ],
      }),
    ).toBe('http://192.168.1.10:8081');
    expect(resolveWebUrl({ ...base, ports: [{ private: 443, public: 8443, proto: 'tcp' }] })).toBe('https://192.168.1.10:8443');
  });

  it('ignores udp-only ports and unreachable docker bridge IPs', () => {
    expect(resolveWebUrl({ ...base, ports: [{ private: 53, public: 53, proto: 'udp' }] })).toBeNull();
    expect(
      resolveWebUrl({
        ...base,
        ports: [{ private: 80, public: null, proto: 'tcp' }],
        networks: { bridge: { IPAddress: '172.17.0.2' } },
      }),
    ).toBeNull();
  });
});

describe('deriveState', () => {
  it('reads health from the status string, checking unhealthy first', () => {
    expect(deriveState('running', 'Up 2 hours (unhealthy)')).toBe('unhealthy');
    expect(deriveState('running', 'Up 2 hours (healthy)')).toBe('healthy');
    expect(deriveState('running', 'Up 5 seconds (health: starting)')).toBe('starting');
    expect(deriveState('running', 'Up 3 days')).toBe('running');
    expect(deriveState('exited', 'Exited (0) 2 days ago')).toBe('exited');
    expect(deriveState('weird', '')).toBe('exited');
  });
});

describe('mapPorts', () => {
  it('collapses IPv4 and IPv6 bindings into one entry', () => {
    const ports = mapPorts([
      { IP: '0.0.0.0', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' },
      { IP: '::', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' },
      { PrivatePort: 9000, Type: 'tcp' },
    ]);
    expect(ports).toEqual([
      { private: 80, public: 8080, proto: 'tcp' },
      { private: 9000, public: null, proto: 'tcp' },
    ]);
  });
});

const raw = (over: Partial<RawContainer> = {}): RawContainer => ({
  Id: 'abcdef1234567890',
  Names: ['/sonarr'],
  Image: 'lscr.io/linuxserver/sonarr',
  State: 'running',
  Status: 'Up 3 hours (healthy)',
  Ports: [{ PrivatePort: 8989, PublicPort: 8989, Type: 'tcp' }],
  Labels: { 'net.unraid.docker.managed': 'dockerman', 'net.unraid.docker.icon': 'https://x/icon.png' },
  ...over,
});

describe('toContainerInfo', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  const opts = { hostIp: null, overrides: {}, hide: [], now };

  it('builds uptime, icon and managed flag', () => {
    const info = toContainerInfo(raw(), '2026-01-01T09:00:00Z', opts)!;
    expect(info).toMatchObject({ name: 'sonarr', state: 'healthy', uptimeSec: 10800, managed: true, icon: 'https://x/icon.png' });
    expect(info.url).toBe('http://[IP]:8989');
  });

  it('has no uptime for stopped containers', () => {
    expect(toContainerInfo(raw({ State: 'exited', Status: 'Exited (0)' }), null, opts)!.uptimeSec).toBeNull();
  });

  it('hides by label, by config list and by override; renames by override', () => {
    expect(toContainerInfo(raw({ Labels: { 'clearview.hide': 'true' } }), null, opts)).toBeNull();
    expect(toContainerInfo(raw(), null, { ...opts, hide: ['sonarr'] })).toBeNull();
    expect(toContainerInfo(raw(), null, { ...opts, overrides: { sonarr: { hide: true } } })).toBeNull();
    expect(toContainerInfo(raw(), null, { ...opts, overrides: { sonarr: { name: 'TV' } } })!.name).toBe('TV');
  });
});

describe('collectContainers against a fake Docker socket', () => {
  let dir: string;
  let server: http.Server;
  let sock: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-'));
    sock = path.join(dir, 'd.sock');
    const list = [
      raw({ Id: 'aaaaaaaaaaaa1111', Names: ['/zeta'], State: 'exited', Status: 'Exited (1) 1 hour ago', Ports: [] }),
      raw({ Id: 'bbbbbbbbbbbb2222', Names: ['/alpha'] }),
    ];
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url?.startsWith('/containers/json')) return void res.end(JSON.stringify(list));
      if (req.url === '/containers/bbbbbbbbbbbb2222/json') {
        return void res.end(JSON.stringify({ State: { StartedAt: new Date(Date.now() - 7200_000).toISOString() } }));
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ message: 'no such container' }));
    });
    await new Promise<void>((r) => server.listen(sock, r));
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lists, inspects running containers and sorts by name', async () => {
    const out = await collectContainers(new DockerClient(sock), { hostIp: '10.0.0.1', overrides: {}, hide: [] });
    expect(out.map((c) => c.name)).toEqual(['alpha', 'zeta']);
    expect(out[0]!.uptimeSec).toBeGreaterThanOrEqual(7199);
    expect(out[1]!.uptimeSec).toBeNull();
    expect(out[0]!.url).toBe('http://10.0.0.1:8989');
  });

  it('reports an unreachable socket clearly', async () => {
    await expect(new DockerClient(path.join(dir, 'missing.sock')).get('/containers/json')).rejects.toThrow(/cannot reach Docker/);
  });
});
