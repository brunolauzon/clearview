import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-cfg-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const write = (name: string, body: string): string => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body);
  return p;
};

describe('loadConfig', () => {
  it('works with no file and no env', () => {
    const cfg = loadConfig({ CONFIG_PATH: path.join(dir, 'missing.yaml') });
    expect(cfg).toMatchObject({ port: 7878, hostIp: null, demo: false, tautulli: null, grafana: null, links: [], hide: [] });
  });

  it('parses the shipped example file', () => {
    const example = path.resolve(import.meta.dirname, '../../config/clearview.example.yaml');
    const cfg = loadConfig({ CONFIG_PATH: example });
    expect(cfg.links.length).toBeGreaterThan(2);
    expect(cfg.links[0]).toMatchObject({ group: 'network', check: 'http' });
    expect(cfg.hide).toContain('watchtower');
    expect(cfg.overrides.plex?.name).toBe('Plex');
  });

  it('needs both Tautulli URL and key, and trims trailing slashes', () => {
    const missing = path.join(dir, 'none.yaml');
    expect(loadConfig({ CONFIG_PATH: missing, TAUTULLI_URL: 'http://t:8181' }).tautulli).toBeNull();
    const cfg = loadConfig({ CONFIG_PATH: missing, TAUTULLI_URL: 'http://t:8181/', TAUTULLI_API_KEY: 'k' });
    expect(cfg.tautulli).toEqual({ url: 'http://t:8181', apiKey: 'k', publicUrl: null });
  });

  it('allows Grafana without a token and reads the public URL', () => {
    const cfg = loadConfig({ CONFIG_PATH: path.join(dir, 'none.yaml'), GRAFANA_URL: 'http://g:3000', GRAFANA_PUBLIC_URL: 'http://192.168.1.10:3000/' });
    expect(cfg.grafana).toEqual({ url: 'http://g:3000', token: null, publicUrl: 'http://192.168.1.10:3000' });
  });

  it('fails fast with a readable message on a bad file', () => {
    const bad = write('bad.yaml', 'links:\n  - name: x\n    url: not-a-url\n');
    expect(() => loadConfig({ CONFIG_PATH: bad })).toThrow(/links\.0\.url/);
  });

  it('treats DEMO flags as booleans', () => {
    const missing = path.join(dir, 'none.yaml');
    expect(loadConfig({ CONFIG_PATH: missing, CLEARVIEW_DEMO: '1' }).demo).toBe(true);
    expect(loadConfig({ CONFIG_PATH: missing, CLEARVIEW_DEMO: '0' }).demo).toBe(false);
  });
});
