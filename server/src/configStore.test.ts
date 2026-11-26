import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { FileConfig } from '@clearview/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { THEME_IDS } from '../../shared/themes';
import { loadConfig, parseFileText, toYamlText, validateFileConfig } from './config';
import { ConfigStore, isUnderMount, parseMountPoints, versionOf } from './configStore';
import { registerConfigRoutes } from './routes/config';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-store-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

let n = 0;
function workspace(initial?: string) {
  const dir = path.join(root, `case-${n++}`);
  fs.mkdirSync(dir);
  const file = path.join(dir, 'clearview.yaml');
  if (initial !== undefined) fs.writeFileSync(file, initial);
  return { dir, file };
}

async function open(initial?: string, env: Record<string, string> = {}) {
  const { dir, file } = workspace(initial);
  const cfg = loadConfig({ CONFIG_PATH: file, ...env });
  const store = new ConfigStore(cfg, { persist: true });
  await store.init();
  return { dir, file, cfg, store };
}

const sample: FileConfig = {
  links: [{ name: 'Router', url: 'http://192.168.1.1', group: 'network', check: 'http' }],
  groups: [
    { name: 'Infrastructure', containers: ['grafana', 'postgres*'] },
    { name: 'Media', containers: ['plex'] },
  ],
  hide: ['watchtower'],
  overrides: { plex: { name: 'Plex', url: 'http://[IP]:32400/web' } },
};

describe('yaml round trip', () => {
  it('writes a file that parses back to the same config, keeping category order and wildcards', () => {
    const text = toYamlText(sample);
    const parsed = parseFileText(text);
    expect(parsed.ok && parsed.file).toEqual(sample);
    expect(text).toMatch(/Managed by the clearview UI/);
    expect(text.indexOf('Infrastructure')).toBeLessThan(text.indexOf('Media'));
  });

  it('omits empty sections and default values', () => {
    const text = toYamlText({ links: [{ name: 'A', url: 'http://a', group: 'g', check: 'http' }], groups: [], hide: [], overrides: {} });
    expect(text).not.toMatch(/groups|containers|check/);
    const empty = parseFileText(toYamlText({ links: [], groups: [], hide: [], overrides: {} }));
    expect(empty.ok && empty.file).toEqual({ links: [], groups: [], hide: [], overrides: {} });
  });

  it('drops empty override fields and entirely empty overrides', () => {
    const text = toYamlText({ links: [], groups: [], hide: [], overrides: { a: { name: '', url: ' ' }, b: { group: 'Media' } } });
    const parsed = parseFileText(text);
    expect(parsed.ok && parsed.file.overrides).toEqual({ b: { group: 'Media' } });
  });
});

describe('validation', () => {
  it('rejects typos and unknown keys instead of ignoring them', () => {
    const r = parseFileText('link:\n  - name: x\n');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues[0]?.message).toMatch(/Unrecognized key/);
  });

  it('reports yaml syntax errors', () => {
    const r = parseFileText('groups: [unclosed');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues[0]?.path).toBe('(yaml)');
  });

  it('refuses duplicate and blank category names from the UI', () => {
    const dup = validateFileConfig({ ...sample, groups: [{ name: 'A', containers: [] }, { name: ' A ', containers: [] }] });
    expect(!dup.ok && dup.issues[0]).toMatchObject({ path: 'groups.1.name', message: expect.stringMatching(/duplicate/) });
    const blank = validateFileConfig({ ...sample, groups: [{ name: '  ', containers: [] }] });
    expect(!blank.ok && blank.issues[0]?.message).toMatch(/required/);
  });

  it('checks link addresses and rejects non-objects', () => {
    const bad = validateFileConfig({ ...sample, links: [{ name: 'x', url: 'nope', group: 'g', check: 'http' }] });
    expect(!bad.ok && bad.issues[0]?.path).toBe('links.0.url');
    expect(validateFileConfig('nope').ok).toBe(false);
    expect(validateFileConfig([]).ok).toBe(false);
  });
});

describe('theme and background', () => {
  it('accepts every built-in theme and round-trips theme, background and accent', () => {
    for (const id of THEME_IDS) expect(parseFileText(`theme: ${id}\n`).ok, id).toBe(true);
    const text = toYamlText({ ...sample, theme: 'dracula', background: '#101820', accent: '#ff79c6' });
    const back = parseFileText(text);
    expect(back.ok && back.file).toMatchObject({ theme: 'dracula', background: '#101820', accent: '#ff79c6' });
    expect(parseFileText('background: "#FDF6E3"\n')).toMatchObject({ ok: true, file: { background: '#fdf6e3' } });
  });

  it('rejects an unknown theme with the list of choices, and a bad or unquoted background', () => {
    const theme = parseFileText('theme: draculaa\n');
    expect(!theme.ok && theme.issues[0]).toMatchObject({ path: 'theme', message: expect.stringMatching(/choose one of: clearview, dracula/) });
    for (const yaml of ['background: black\n', 'background: #101820\n']) {
      const r = parseFileText(yaml);
      expect(!r.ok && r.issues[0]?.path, yaml).toBe('background');
    }
  });

  it('treats blanks from the UI as unset, applies a saved look live and clears it again', async () => {
    const blank = validateFileConfig({ ...sample, theme: '', background: '' });
    expect(blank.ok && blank.file.theme).toBeUndefined();

    const { cfg, store } = await open('title: x\n');
    expect((await store.save({ ...sample, theme: 'nord', background: '#000000' }, store.state().version)).ok).toBe(true);
    expect(cfg).toMatchObject({ theme: 'nord', background: '#000000' });
    expect((await store.save(sample, store.state().version)).ok).toBe(true);
    expect(cfg).toMatchObject({ theme: null, background: null });
  });
});

describe('weather and stocks', () => {
  it('round-trips, upper-cases and de-duplicates symbols, and defaults the units', () => {
    const r = parseFileText('weather:\n  location: Paris\nstocks: [aapl, ^gspc, AAPL, shop.to, btc-usd]\n');
    expect(r.ok && r.file.weather).toEqual({ location: 'Paris', units: 'metric' });
    expect(r.ok && r.file.stocks).toEqual(['AAPL', '^GSPC', 'SHOP.TO', 'BTC-USD']);
    const text = toYamlText({ ...sample, weather: { location: 'Paris', units: 'imperial' }, stocks: ['^GSPC', 'EURUSD=X'] });
    const back = parseFileText(text);
    expect(back.ok && back.file.stocks).toEqual(['^GSPC', 'EURUSD=X']);
    expect(back.ok && back.file.weather?.units).toBe('imperial');
  });

  it('rejects bad symbols, too many of them, a blank location and unknown units', () => {
    const issue = (yaml: string) => {
      const r = parseFileText(yaml);
      return r.ok ? null : r.issues[0]!.path;
    };
    expect(issue('stocks: ["not a symbol"]\n')).toBe('stocks.0');
    expect(issue('stocks: [A, B, C, D, E, F, G]\n')).toBe('stocks');
    expect(issue('weather:\n  location: "  "\n')).toBe('weather.location');
    expect(issue('weather:\n  location: x\n  units: kelvin\n')).toBe('weather.units');
  });

  it('is applied live when saved and cleared when saved without it', async () => {
    const { cfg, store } = await open('title: x\n');
    const next = { ...sample, weather: { location: 'Paris', units: 'metric' as const }, stocks: ['AAPL'] };
    expect((await store.save(next, store.state().version)).ok).toBe(true);
    expect(cfg.weather?.location).toBe('Paris');
    expect(cfg.stocks).toEqual(['AAPL']);
    expect((await store.save(sample, store.state().version)).ok).toBe(true);
    expect(cfg.weather).toBeNull();
    expect(cfg.stocks).toEqual([]);
  });
});

describe('accent colour', () => {
  it('round-trips through yaml, lower-cased, and is quoted so # is not a comment', () => {
    const text = toYamlText({ ...sample, accent: '#3b82f6' });
    expect(text).toMatch(/accent: ["']#3b82f6["']/);
    const parsed = parseFileText(text);
    expect(parsed.ok && parsed.file.accent).toBe('#3b82f6');
    const upper = parseFileText('accent: "#3B82F6"\n');
    expect(upper.ok && upper.file.accent).toBe('#3b82f6');
  });

  it('rejects anything that is not a 6-digit hex colour', () => {
    for (const bad of ['blue', '#fff', '3b82f6', '#3b82f', '#gggggg']) {
      const r = parseFileText(`accent: "${bad}"\n`);
      expect(r.ok, bad).toBe(false);
      expect(!r.ok && r.issues[0]?.path).toBe('accent');
    }
  });

  it('explains the unquoted-# mistake instead of silently ignoring it', () => {
    const r = parseFileText('accent: #3b82f6\n');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues[0]).toMatchObject({ path: 'accent', message: expect.stringMatching(/quote it/) });
  });

  it('treats a blank colour from the UI as unset and rejects a bad one', () => {
    const blank = validateFileConfig({ ...sample, accent: '' });
    expect(blank.ok && blank.file.accent).toBeUndefined();
    const bad = validateFileConfig({ ...sample, accent: 'blue' });
    expect(!bad.ok && bad.issues[0]?.path).toBe('accent');
  });

  it('is applied live when saved, and cleared when saved without one', async () => {
    const { cfg, store } = await open('title: x\n');
    expect((await store.save({ ...sample, accent: '#3b82f6' }, store.state().version)).ok).toBe(true);
    expect(cfg.accent).toBe('#3b82f6');
    expect(store.state().config.accent).toBe('#3b82f6');
    expect((await store.save(sample, store.state().version)).ok).toBe(true);
    expect(cfg.accent).toBeNull();
  });
});

describe('ConfigStore', () => {
  it('starts empty and writable when the file does not exist yet', async () => {
    const { store } = await open();
    const s = store.state();
    expect(s).toMatchObject({ yaml: '', writable: true, persisted: true, loadError: null });
    expect(s.config.links).toEqual([]);
  });

  it('saves from the editor: writes the file, keeps a .bak, applies the config live and notifies', async () => {
    const { file, cfg, store } = await open('title: old\n');
    let notified = 0;
    store.onChange(() => notified++);

    const result = await store.save(sample, store.state().version);

    expect(result.ok).toBe(true);
    expect(notified).toBe(1);
    expect(cfg.groups.map((g) => g.name)).toEqual(['Infrastructure', 'Media']);
    expect(cfg.links[0]?.name).toBe('Router');
    expect(cfg.hide).toEqual(['watchtower']);
    expect(fs.readFileSync(`${file}.bak`, 'utf8')).toBe('title: old\n');
    const onDisk = parseFileText(fs.readFileSync(file, 'utf8'));
    expect(onDisk.ok && onDisk.file).toEqual(sample);
    expect(store.state().version).toBe(versionOf(fs.readFileSync(file, 'utf8')));
  });

  it('refuses a save based on an old version, and changes nothing', async () => {
    const { file, store } = await open('title: mine\n');
    const r = await store.save(sample, 'stale-version');
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(fs.readFileSync(file, 'utf8')).toBe('title: mine\n');
  });

  it('returns validation issues without touching the file', async () => {
    const { file, store } = await open('title: mine\n');
    const r = await store.save({ ...sample, links: [{ name: 'x', url: 'nope', group: 'g', check: 'http' }] }, store.state().version);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(!r.ok && r.issues[0]?.path).toBe('links.0.url');
    expect(fs.readFileSync(file, 'utf8')).toBe('title: mine\n');
  });

  it('saves raw yaml verbatim, comments included', async () => {
    const { file, cfg, store } = await open();
    const text = '# my notes\ngroups:\n  Media: [plex]   # keep me\n';
    expect((await store.saveRaw(text, store.state().version)).ok).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe(text);
    expect(cfg.groups).toEqual([{ name: 'Media', containers: ['plex'] }]);
  });

  it('rejects invalid raw yaml and oversized input', async () => {
    const { store } = await open();
    expect(await store.saveRaw('groups: [oops', store.state().version)).toMatchObject({ ok: false, status: 400 });
    expect(await store.saveRaw(42, store.state().version)).toMatchObject({ ok: false, status: 400 });
    expect(await store.saveRaw('#'.repeat(300 * 1024), store.state().version)).toMatchObject({ ok: false, status: 400 });
  });

  it('is read-only when CONFIG_READONLY is set', async () => {
    const { file, store } = await open('title: x\n', { CONFIG_READONLY: '1' });
    expect(store.state()).toMatchObject({ writable: false, readOnlyReason: expect.stringMatching(/CONFIG_READONLY/) });
    expect(await store.save(sample, store.state().version)).toMatchObject({ ok: false, status: 403 });
    expect(fs.readFileSync(file, 'utf8')).toBe('title: x\n');
  });

  it('is read-only when the folder cannot be written', async () => {
    if (process.getuid?.() === 0) return; // root ignores permissions
    const { dir, store: _ignored } = await open('title: x\n');
    fs.chmodSync(dir, 0o555);
    try {
      const cfg = loadConfig({ CONFIG_PATH: path.join(dir, 'clearview.yaml') });
      const store = new ConfigStore(cfg, { persist: true });
      await store.init();
      fs.chmodSync(path.join(dir, 'clearview.yaml'), 0o444);
      await store.init();
      expect(store.state().writable).toBe(false);
      expect(store.state().readOnlyReason).toMatch(/not writable/);
    } finally {
      fs.chmodSync(dir, 0o755);
    }
  });

  it('picks up hand edits to the file', async () => {
    const { file, cfg, store } = await open('title: a\n');
    let notified = 0;
    store.onChange(() => notified++);
    fs.writeFileSync(file, 'groups:\n  Media: [plex]\n');
    await store.syncFromDisk();
    expect(cfg.groups).toEqual([{ name: 'Media', containers: ['plex'] }]);
    expect(notified).toBe(1);
    await store.syncFromDisk(); // unchanged file: nothing more
    expect(notified).toBe(1);
  });

  it('keeps the last good config when the file is broken by hand, and blocks editor saves until fixed', async () => {
    const { file, cfg, store } = await open('groups:\n  Media: [plex]\n');
    fs.writeFileSync(file, 'groups: [oops');
    await store.syncFromDisk();
    expect(cfg.groups).toEqual([{ name: 'Media', containers: ['plex'] }]);
    expect(store.state().loadError).toMatch(/yaml/);
    expect(store.state().yaml).toBe('groups: [oops');

    expect(await store.save(sample, store.state().version)).toMatchObject({ ok: false, status: 409 });
    expect((await store.saveRaw('groups:\n  Home: [hass]\n', store.state().version)).ok).toBe(true);
    expect(store.state().loadError).toBeNull();
  });

  it('serialises concurrent saves: the second one sees the new version and is refused', async () => {
    const { store } = await open('title: x\n');
    const v = store.state().version;
    const [a, b] = await Promise.all([store.save(sample, v), store.save({ ...sample, hide: [] }, v)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
  });

  it('demo mode applies edits in memory and never touches disk', async () => {
    const { dir, file } = workspace();
    const cfg = loadConfig({ CONFIG_PATH: file });
    const store = new ConfigStore(cfg, { persist: false, seed: sample });
    await store.init();
    expect(cfg.groups).toHaveLength(2);
    expect(store.state()).toMatchObject({ persisted: false, writable: true });

    expect((await store.save({ ...sample, groups: [] }, store.state().version)).ok).toBe(true);
    expect(cfg.groups).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe('mount detection', () => {
  const info = [
    '36 35 98:0 / / rw - overlay overlay rw',
    '40 36 8:1 /mnt/user/appdata/clearview /config rw,relatime - ext4 /dev/sda1 rw',
    '41 36 8:1 /x /with\\040space rw - ext4 /dev/sda1 rw',
  ].join('\n');

  it('reads mount points and decodes escapes', () => {
    expect(parseMountPoints(info)).toEqual(['/', '/config', '/with space']);
  });

  it('is true for a file inside a mounted folder, false for the container layer', () => {
    const mounts = parseMountPoints(info);
    expect(isUnderMount('/config/clearview.yaml', mounts)).toBe(true);
    expect(isUnderMount('/etc/clearview.yaml', mounts)).toBe(false); // only "/" matches, which does not count
  });
});

describe('config routes', () => {
  async function server(readOnly = false) {
    const { store } = await open('title: x\n', readOnly ? { CONFIG_READONLY: '1' } : {});
    const app = Fastify();
    registerConfigRoutes(app, store);
    return { app, store };
  }
  const json = { 'content-type': 'application/json' };

  it('GET returns the state', async () => {
    const { app } = await server();
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ yaml: 'title: x\n', writable: true });
  });

  it('PUT saves and returns the new state', async () => {
    const { app, store } = await server();
    const res = await app.inject({ method: 'PUT', url: '/api/config', headers: json, payload: { config: sample, version: store.state().version } });
    expect(res.statusCode).toBe(200);
    expect(res.json().state.config.groups).toHaveLength(2);
  });

  it('maps failures to status codes with issues', async () => {
    const { app, store } = await server();
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/config',
      headers: json,
      payload: { config: { ...sample, links: [{ name: 'x', url: 'nope', group: 'g', check: 'http' }] }, version: store.state().version },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().issues[0].path).toBe('links.0.url');
    const stale = await app.inject({ method: 'PUT', url: '/api/config/raw', headers: json, payload: { yaml: 'title: y\n', version: 'old' } });
    expect(stale.statusCode).toBe(409);
  });

  it('refuses writes that are not JSON, and cross-origin writes', async () => {
    const { app, store } = await server();
    const payload = JSON.stringify({ config: sample, version: store.state().version });
    const text = await app.inject({ method: 'PUT', url: '/api/config', headers: { 'content-type': 'text/plain' }, payload });
    expect(text.statusCode).toBe(415);
    const cross = await app.inject({
      method: 'PUT',
      url: '/api/config',
      headers: { ...json, origin: 'http://evil.example', host: 'tower:7878' },
      payload,
    });
    expect(cross.statusCode).toBe(403);
    const same = await app.inject({
      method: 'PUT',
      url: '/api/config',
      headers: { ...json, origin: 'http://tower:7878', host: 'tower:7878' },
      payload,
    });
    expect(same.statusCode).toBe(200);
  });

  it('answers 403 when editing is off', async () => {
    const { app, store } = await server(true);
    const res = await app.inject({ method: 'PUT', url: '/api/config', headers: json, payload: { config: sample, version: store.state().version } });
    expect(res.statusCode).toBe(403);
  });
});
