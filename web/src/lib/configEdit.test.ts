import { describe, expect, it } from 'vitest';
import type { FileConfig } from '@clearview/shared';
import {
  containerEdit,
  containerEntries,
  moveGroup,
  parsePatterns,
  parseSymbols,
  removeContainer,
  removeGroup,
  removeLink,
  setContainer,
  upsertGroup,
  upsertLink,
} from './configEdit';

const base = (): FileConfig => ({
  links: [
    { name: 'Router', url: 'http://192.168.1.1', group: 'network', check: 'http' },
    { name: 'NAS', url: 'http://192.168.1.30', group: 'storage', check: 'tcp' },
  ],
  groups: [
    { name: 'Infrastructure', containers: ['grafana'] },
    { name: 'Media', containers: ['plex'] },
    { name: 'Home', containers: ['home-assistant'] },
  ],
  hide: ['watchtower'],
  overrides: { plex: { name: 'Plex', group: 'Media' }, radarr: { group: 'Media' } },
});

describe('parsePatterns', () => {
  it('splits on lines and commas, trims, drops blanks and repeats, keeps order', () => {
    expect(parsePatterns(' plex,\n tautulli\n\nplex ,*arr ')).toEqual(['plex', 'tautulli', '*arr']);
    expect(parsePatterns('')).toEqual([]);
  });
});

describe('parseSymbols', () => {
  it('accepts commas or spaces, upper-cases and removes repeats', () => {
    expect(parseSymbols(' aapl, ^gspc   shop.to,AAPL\nbtc-usd ')).toEqual(['AAPL', '^GSPC', 'SHOP.TO', 'BTC-USD']);
    expect(parseSymbols('  ')).toEqual([]);
  });
});

describe('links', () => {
  it('adds, replaces and removes without mutating the input', () => {
    const c = base();
    const added = upsertLink(c, null, { name: 'Printer', url: 'http://p', group: 'devices', check: 'none' });
    expect(added.links.map((l) => l.name)).toEqual(['Router', 'NAS', 'Printer']);
    const edited = upsertLink(c, 0, { ...c.links[0]!, name: 'Gateway' });
    expect(edited.links[0]?.name).toBe('Gateway');
    expect(removeLink(c, 1).links.map((l) => l.name)).toEqual(['Router']);
    expect(c.links).toHaveLength(2);
  });
});

describe('categories', () => {
  it('renaming a category follows pinned containers to the new name', () => {
    const out = upsertGroup(base(), 1, { name: 'Streaming', containers: ['plex'] });
    expect(out.groups.map((g) => g.name)).toEqual(['Infrastructure', 'Streaming', 'Home']);
    expect(out.overrides.plex).toEqual({ name: 'Plex', group: 'Streaming' });
    expect(out.overrides.radarr).toEqual({ group: 'Streaming' });
  });

  it('adds a category at the end', () => {
    expect(upsertGroup(base(), null, { name: 'Apps', containers: [] }).groups.at(-1)?.name).toBe('Apps');
  });

  it('removing a category unpins containers and drops overrides that become empty', () => {
    const out = removeGroup(base(), 1);
    expect(out.groups.map((g) => g.name)).toEqual(['Infrastructure', 'Home']);
    expect(out.overrides).toEqual({ plex: { name: 'Plex' } });
  });

  it('moves up and down, and stays put at the ends', () => {
    const c = base();
    expect(moveGroup(c, 1, -1).groups.map((g) => g.name)).toEqual(['Media', 'Infrastructure', 'Home']);
    expect(moveGroup(c, 1, 1).groups.map((g) => g.name)).toEqual(['Infrastructure', 'Home', 'Media']);
    expect(moveGroup(c, 0, -1)).toBe(c);
    expect(moveGroup(c, 2, 1)).toBe(c);
  });
});

describe('per-container settings', () => {
  it('reads the current values for the form', () => {
    expect(containerEdit(base(), 'plex')).toEqual({ displayName: 'Plex', url: '', group: 'Media', hidden: false });
    expect(containerEdit(base(), 'watchtower').hidden).toBe(true);
    expect(containerEdit(base(), 'unknown')).toEqual({ displayName: '', url: '', group: '', hidden: false });
  });

  it('writes only the fields that are set and keeps an existing icon', () => {
    const c = { ...base(), overrides: { plex: { icon: 'p.png', name: 'Plex' } } };
    const out = setContainer(c, 'plex', { displayName: '', url: ' http://x ', group: 'Media', hidden: false });
    expect(out.overrides.plex).toEqual({ url: 'http://x', icon: 'p.png', group: 'Media' });
  });

  it('removes the entry when nothing is left, and manages the hide list', () => {
    const c = base();
    const cleared = setContainer(c, 'radarr', { displayName: '', url: '', group: '', hidden: false });
    expect('radarr' in cleared.overrides).toBe(false);
    const hidden = setContainer(c, 'sonarr', { displayName: '', url: '', group: '', hidden: true });
    expect(hidden.hide).toEqual(['watchtower', 'sonarr']);
    expect('sonarr' in hidden.overrides).toBe(false);
    const shown = setContainer(hidden, 'sonarr', { displayName: '', url: '', group: '', hidden: false });
    expect(shown.hide).toEqual(['watchtower']);
  });

  it('removeContainer forgets all settings including hidden', () => {
    const out = removeContainer(base(), 'watchtower');
    expect(out.hide).toEqual([]);
    expect(removeContainer(base(), 'plex').overrides.plex).toBeUndefined();
  });

  it('lists every container that has a setting, sorted, with hidden flagged', () => {
    const entries = containerEntries(base());
    expect(entries.map((e) => e.name)).toEqual(['plex', 'radarr', 'watchtower']);
    expect(entries.map((e) => e.hidden)).toEqual([false, false, true]);
  });
});
