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

  it('reads categories in file order, with wildcard patterns', () => {
    const example = path.resolve(import.meta.dirname, '../../config/clearview.example.yaml');
    const cfg = loadConfig({ CONFIG_PATH: example });
    expect(cfg.groups.map((g) => g.name)).toEqual(['Infrastructure', 'Media', 'Downloads', 'Home']);
    expect(cfg.groups.find((g) => g.name === 'Downloads')?.containers).toContain('*arr');
  });

  it('defaults to no categories and rejects a category that is not a list', () => {
    expect(loadConfig({ CONFIG_PATH: path.join(dir, 'missing.yaml') }).groups).toEqual([]);
    const bad = write('badgroups.yaml', 'groups:\n  Media: plex\n');
    expect(() => loadConfig({ CONFIG_PATH: bad })).toThrow(/groups\.Media/);
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

  it('enables UniFi and Deluge only with both their address and secret, and verifies TLS unless told not to', () => {
    const missing = path.join(dir, 'none.yaml');
    expect(loadConfig({ CONFIG_PATH: missing, UNIFI_URL: 'https://192.168.1.1' }).unifi).toBeNull();
    expect(loadConfig({ CONFIG_PATH: missing, DELUGE_URL: 'http://t:8112' }).deluge).toBeNull();
    const cfg = loadConfig({
      CONFIG_PATH: missing,
      UNIFI_URL: 'https://192.168.1.1/',
      UNIFI_API_KEY: 'k',
      DELUGE_URL: 'http://t:8112/',
      DELUGE_PASSWORD: 'p',
    });
    expect(cfg.unifi).toEqual({ url: 'https://192.168.1.1', apiKey: 'k', site: null, insecure: false });
    expect(cfg.deluge).toEqual({ url: 'http://t:8112', password: 'p' });
    const insecure = loadConfig({ CONFIG_PATH: missing, UNIFI_URL: 'https://x', UNIFI_API_KEY: 'k', UNIFI_INSECURE: '1', UNIFI_SITE: 'Home' });
    expect(insecure.unifi).toMatchObject({ insecure: true, site: 'Home' });
  });

  it('shows demo alerts unless switched off', () => {
    const missing = path.join(dir, 'none.yaml');
    expect(loadConfig({ CONFIG_PATH: missing }).demoAlerts).toBe(true);
    expect(loadConfig({ CONFIG_PATH: missing, CLEARVIEW_DEMO_ALERTS: '0' }).demoAlerts).toBe(false);
  });

  it('treats DEMO flags as booleans', () => {
    const missing = path.join(dir, 'none.yaml');
    expect(loadConfig({ CONFIG_PATH: missing, CLEARVIEW_DEMO: '1' }).demo).toBe(true);
    expect(loadConfig({ CONFIG_PATH: missing, CLEARVIEW_DEMO: '0' }).demo).toBe(false);
  });
});
