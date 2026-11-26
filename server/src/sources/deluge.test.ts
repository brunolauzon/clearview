import { afterEach, describe, expect, it, vi } from 'vitest';
import { DelugeSource, mapUpdate, type RawTorrent } from './deluge';

const torrent = (over: RawTorrent): RawTorrent => ({ name: 't', state: 'Seeding', progress: 100, download_payload_rate: 0, eta: 0, total_wanted: 1000, ...over });

describe('mapUpdate', () => {
  it('counts by state and lists downloading torrents fastest first', () => {
    const out = mapUpdate({
      connected: true,
      torrents: {
        a: torrent({ name: 'slow', state: 'Downloading', progress: 10.04, download_payload_rate: 10, eta: 600 }),
        b: torrent({ name: 'fast', state: 'Downloading', progress: 140, download_payload_rate: 999, eta: -1 }),
        c: torrent({ state: 'Seeding' }),
        d: torrent({ state: 'Paused' }),
        e: torrent({ state: 'Queued' }),
        f: torrent({ state: 'Checking' }),
        g: torrent({ state: 'Moving' }),
        h: torrent({ state: 'Error' }),
      },
      stats: { download_rate: 1009, upload_rate: 55, free_space: 5000 },
    });
    expect(out.counts).toEqual({ total: 8, downloading: 2, seeding: 1, paused: 1, queued: 1, checking: 2, error: 1 });
    expect(out.active.map((t) => t.name)).toEqual(['fast', 'slow']);
    expect(out.active[0]).toMatchObject({ progressPct: 100, etaSec: null }); // clamped; -1 means no estimate
    expect(out.active[1]).toMatchObject({ progressPct: 10, etaSec: 600 });
    expect(out).toMatchObject({ downloadBytesPerSec: 1009, uploadBytesPerSec: 55, freeBytes: 5000 });
  });

  it('shows at most five active torrents and copes with an empty client', () => {
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`${i}`, torrent({ state: 'Downloading' })]));
    expect(mapUpdate({ torrents: many }).active).toHaveLength(5);
    expect(mapUpdate({ torrents: null, stats: null })).toMatchObject({ counts: { total: 0 }, active: [], freeBytes: null });
    expect(mapUpdate({ stats: { free_space: -1 } }).freeBytes).toBeNull();
  });
});

describe('DelugeSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A small stand-in for deluge-web: cookie sessions, the same error codes, a daemon connection. */
  function fakeDeluge(opts: { hosts?: unknown[][]; connected?: boolean } = {}) {
    const state = { session: 0, valid: new Set<string>(), connected: opts.connected ?? true, log: [] as string[] };
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      expect(url).toBe('http://deluge:8112/json');
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      const { method, params, id } = JSON.parse(init.body as string);
      state.log.push(method);
      const reply = (result: unknown, error: unknown = null, cookie?: string) =>
        new Response(JSON.stringify({ result, error, id }), { headers: cookie ? { 'Set-Cookie': `${cookie}; Path=/json` } : {} });

      if (method === 'auth.login') {
        if (params[0] !== 'pw-secret') return reply(false);
        const cookie = `_session_id=s${++state.session}`;
        state.valid.add(cookie);
        return reply(true, null, cookie);
      }
      if (!state.valid.has(headers.Cookie ?? '')) return reply(null, { message: 'Not authenticated', code: 1 });
      if (method === 'web.connected') return reply(state.connected);
      if (method === 'web.get_hosts') return reply(opts.hosts ?? [['host-1', '127.0.0.1', 58846, 'localclient']]);
      if (method === 'web.connect') {
        expect(params).toEqual(['host-1']);
        state.connected = true;
        return reply([]);
      }
      if (method === 'web.update_ui') {
        return reply(
          state.connected
            ? { connected: true, torrents: { a: torrent({}) }, stats: { download_rate: 5, upload_rate: 6, free_space: 7 } }
            : { connected: false, torrents: null, stats: {} },
        );
      }
      return reply(null, { message: 'Unknown method', code: 2 });
    });
    return state;
  }
  const source = (password = 'pw-secret') => new DelugeSource({ url: 'http://deluge:8112', password });

  it('logs in once, reuses the session cookie, and logs in again when it expires', async () => {
    const server = fakeDeluge();
    const client = source();
    expect((await client.collect()).counts.seeding).toBe(1);
    await client.collect();
    expect(server.log.filter((m) => m === 'auth.login')).toHaveLength(1);

    server.valid.clear(); // the session times out
    await expect(client.collect()).resolves.toMatchObject({ downloadBytesPerSec: 5 });
    expect(server.log.filter((m) => m === 'auth.login')).toHaveLength(2);
  });

  it('says the password is wrong, without repeating it', async () => {
    fakeDeluge();
    const error = await source('nope-secret').collect().catch((e: Error) => e.message);
    expect(error).toBe('deluge: wrong password');
  });

  it('connects a disconnected web UI to its only daemon', async () => {
    const server = fakeDeluge({ connected: false });
    await expect(source().collect()).resolves.toMatchObject({ freeBytes: 7 });
    expect(server.log).toContain('web.connect');
  });

  it('does not guess between several daemons', async () => {
    const server = fakeDeluge({ connected: false, hosts: [['host-1'], ['host-2']] });
    await expect(source().collect()).rejects.toThrow(/Connection Manager/);
    expect(server.log).not.toContain('web.connect');
  });
});
