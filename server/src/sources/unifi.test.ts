import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { countClients, findGateway, httpGetter, mapGateway, pickSite, summariseDevices, UnifiSource, type RawDevice } from './unifi';

const cfg = { url: 'https://unifi.local', apiKey: 'secret-key', site: null, insecure: false };

const udm: RawDevice = { id: 'gw', name: 'Dream Machine', model: 'UDM-Pro', state: 'ONLINE', features: ['switching', 'routing'] };
const ap: RawDevice = { id: 'ap', name: 'Garage AP', model: 'U6-Lite', state: 'OFFLINE', features: ['accessPoint'] };
const sw: RawDevice = { id: 'sw', name: 'Switch', model: 'USW-24', state: 'UPDATING', features: ['switching'] };

describe('pickSite', () => {
  const sites = [
    { id: '1', name: 'Cabin', internalReference: 'abc123' },
    { id: '2', name: 'Home', internalReference: 'default' },
  ];
  it('prefers the default site, or matches a name or reference when asked', () => {
    expect(pickSite(sites, null)?.id).toBe('2');
    expect(pickSite(sites, 'cabin')?.id).toBe('1');
    expect(pickSite(sites, 'ABC123')?.id).toBe('1');
    expect(pickSite(sites, 'office')).toBeNull();
    expect(pickSite([sites[0]!], null)?.id).toBe('1');
    expect(pickSite([], null)).toBeNull();
  });
});

describe('findGateway', () => {
  it('recognises gateways by model family or capabilities, preferring an online one', () => {
    expect(findGateway([ap, sw, udm])?.id).toBe('gw');
    expect(findGateway([{ id: 'x', model: 'UCG-Max', features: ['switching'] }])?.id).toBe('x');
    expect(findGateway([{ id: 'y', model: 'Other', features: ['gateway'] }])?.id).toBe('y');
    expect(findGateway([{ ...udm, id: 'old', state: 'OFFLINE' }, udm])?.id).toBe('gw');
    expect(findGateway([ap, sw])).toBeNull();
  });
});

describe('countClients', () => {
  it('splits by connection type and counts guests', () => {
    const out = countClients([
      { type: 'WIRED' },
      { type: 'WIRELESS' },
      { type: 'WIRELESS', access: { type: 'GUEST' } },
      { type: 'VPN' },
      { type: 'TELEPORT' },
      { type: 'SOMETHING_NEW' },
    ]);
    expect(out).toEqual({ total: 6, wired: 1, wireless: 2, vpn: 2, guests: 1 });
  });
});

describe('summariseDevices', () => {
  it('lists everything that is not online, with a readable state', () => {
    expect(summariseDevices([udm, ap, sw])).toEqual({
      total: 3,
      online: 1,
      problems: [
        { name: 'Garage AP', state: 'offline' },
        { name: 'Switch', state: 'updating' },
      ],
    });
  });
});

describe('mapGateway', () => {
  it('rounds percentages and passes rates through', () => {
    const g = mapGateway(udm, { uptimeSec: 100, cpuUtilizationPct: 12.345, memoryUtilizationPct: 50, uplink: { rxRateBps: 8e6, txRateBps: 1e6 } });
    expect(g).toMatchObject({ cpuPct: 12.3, memPct: 50, rxBps: 8e6, txBps: 1e6, uptimeSec: 100 });
  });
  it('leaves unknowns null', () => {
    expect(mapGateway(udm, null)).toMatchObject({ cpuPct: null, rxBps: null, uptimeSec: null });
  });
});

describe('UnifiSource', () => {
  function fake(devices: RawDevice[], opts: { statsFail?: boolean } = {}) {
    const calls: string[] = [];
    const clients = [{ type: 'WIRED' }, { type: 'WIRELESS' }, { type: 'WIRELESS' }];
    const get = async (path: string) => {
      calls.push(path);
      const [route, query] = path.split('?');
      const offset = Number(new URLSearchParams(query).get('offset') ?? 0);
      if (route!.endsWith('/sites')) return { totalCount: 1, data: [{ id: 'site-1', name: 'Home', internalReference: 'default' }] };
      if (route!.endsWith('/devices')) return { totalCount: devices.length, data: devices };
      // clients come back two at a time to exercise paging
      if (route!.endsWith('/clients')) return { totalCount: clients.length, data: clients.slice(offset, offset + 2) };
      if (opts.statsFail) throw new Error('unifi: HTTP 500');
      return { cpuUtilizationPct: 7, uplink: { rxRateBps: 1000, txRateBps: 500 } };
    };
    return { calls, get };
  }

  it('collects site, gateway stats, paged clients and devices, and caches the site', async () => {
    const { calls, get } = fake([udm, ap]);
    const source = new UnifiSource(cfg, get);
    const out = await source.collect();
    expect(out.site).toBe('Home');
    expect(out.clients).toMatchObject({ total: 3, wired: 1, wireless: 2 });
    expect(out.devices).toMatchObject({ total: 2, online: 1 });
    expect(out.gateway).toMatchObject({ name: 'Dream Machine', cpuPct: 7, rxBps: 1000 });
    expect(calls.some((c) => c.includes('/sites/site-1/devices/gw/statistics/latest'))).toBe(true);
    expect(calls.filter((c) => c.includes('/clients?'))).toHaveLength(2);

    await source.collect();
    expect(calls.filter((c) => c.includes('/v1/sites?'))).toHaveLength(1);
  });

  it('still reports the network when the statistics call fails, and skips it for an offline gateway', async () => {
    const failing = fake([udm], { statsFail: true });
    expect((await new UnifiSource(cfg, failing.get).collect()).gateway).toMatchObject({ cpuPct: null });
    const offline = fake([{ ...udm, state: 'OFFLINE' }]);
    await new UnifiSource(cfg, offline.get).collect();
    expect(offline.calls.some((c) => c.includes('statistics'))).toBe(false);
  });

  it('names the sites it found when the requested one does not exist', async () => {
    const { get } = fake([udm]);
    await expect(new UnifiSource({ ...cfg, site: 'Office' }, get).collect()).rejects.toThrow(/no site "Office" \(found: Home\)/);
  });
});

describe('httpGetter', () => {
  let server: http.Server;
  let base: string;
  const seen: (string | undefined)[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push(req.headers['x-api-key'] as string | undefined);
      if (req.url === '/ok') return void res.end('{"data":[]}');
      if (req.url === '/html') return void res.end('<html>');
      res.statusCode = req.url === '/denied' ? 401 : 500;
      res.end('{}');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  it('sends the API key and parses JSON', async () => {
    await expect(httpGetter({ ...cfg, url: base })('/ok')).resolves.toEqual({ data: [] });
    expect(seen.at(-1)).toBe('secret-key');
  });

  it('explains failures without ever including the key', async () => {
    const get = httpGetter({ ...cfg, url: base });
    await expect(get('/denied')).rejects.toThrow(/auth failed \(HTTP 401\)/);
    await expect(get('/boom')).rejects.toThrow(/HTTP 500/);
    await expect(get('/html')).rejects.toThrow(/not JSON/);
    const down = httpGetter({ ...cfg, url: 'http://127.0.0.1:1' });
    const error = await down('/ok').catch((e: Error) => e.message);
    expect(error).toMatch(/cannot connect/);
    expect(error).not.toContain('secret-key');
  });
});
