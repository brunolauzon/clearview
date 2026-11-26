import { describe, expect, it } from 'vitest';
import type { ContainerInfo } from '@clearview/shared';
import { filterBy, sortContainers, stateLevel } from './rows';

const c = (name: string, state: ContainerInfo['state'], uptimeSec: number | null): ContainerInfo => ({
  id: name,
  rawName: name,
  name,
  image: `img/${name}`,
  state,
  statusText: '',
  startedAt: null,
  uptimeSec,
  ports: [],
  url: null,
  icon: null,
  group: null,
  managed: false,
});

const rows = [c('plex', 'healthy', 1000), c('sonarr', 'unhealthy', 50), c('duplicati', 'exited', null), c('radarr', 'running', 9)];

describe('sortContainers', () => {
  it('sorts by name case-insensitively', () => {
    expect(sortContainers(rows, 'name').map((r) => r.name)).toEqual(['duplicati', 'plex', 'radarr', 'sonarr']);
  });
  it('floats problems to the top by state', () => {
    expect(sortContainers(rows, 'state').map((r) => r.name)).toEqual(['sonarr', 'duplicati', 'radarr', 'plex']);
  });
  it('sorts youngest first by age, stopped last', () => {
    expect(sortContainers(rows, 'age').map((r) => r.name)).toEqual(['radarr', 'sonarr', 'plex', 'duplicati']);
  });
  it('sorts busiest first by cpu and by memory, unsampled containers last', () => {
    const stats = {
      plex: { cpuPct: 20, memBytes: 100, memLimitBytes: 1000, memPct: 10 },
      sonarr: { cpuPct: 5, memBytes: 900, memLimitBytes: 1000, memPct: 90 },
      radarr: { cpuPct: null, memBytes: 500, memLimitBytes: 1000, memPct: 50 },
    };
    expect(sortContainers(rows, 'cpu', stats).map((r) => r.name)).toEqual(['plex', 'sonarr', 'duplicati', 'radarr']);
    expect(sortContainers(rows, 'mem', stats).map((r) => r.name)).toEqual(['sonarr', 'radarr', 'plex', 'duplicati']);
  });
  it('does not mutate its input', () => {
    const before = rows.map((r) => r.name);
    sortContainers(rows, 'state');
    expect(rows.map((r) => r.name)).toEqual(before);
  });
});

describe('sortContainers by category', () => {
  const g = (name: string, group: string | null): ContainerInfo => ({ ...c(name, 'running', 1), group });

  it('lists configured categories in order, other categories alphabetically, then uncategorised', () => {
    const list = [g('a', 'Zeta'), g('b', null), g('c', 'Media'), g('d', 'Infrastructure'), g('e', 'Alpha')];
    const out = sortContainers(list, 'group', {}, ['Infrastructure', 'Media']);
    expect(out.map((r) => r.name)).toEqual(['d', 'c', 'e', 'a', 'b']);
  });

  it('sorts by name inside a category', () => {
    const list = [g('plex', 'Media'), g('overseerr', 'Media'), g('tautulli', 'Media')];
    expect(sortContainers(list, 'group', {}, ['Media']).map((r) => r.name)).toEqual(['overseerr', 'plex', 'tautulli']);
  });

  it('behaves like a name sort when nothing has a category', () => {
    expect(sortContainers(rows, 'group').map((r) => r.name)).toEqual(['duplicati', 'plex', 'radarr', 'sonarr']);
  });
});

describe('filterBy', () => {
  it('matches case-insensitively and passes everything for an empty query', () => {
    expect(filterBy(rows, 'ARR', (r) => r.name).map((r) => r.name)).toEqual(['sonarr', 'radarr']);
    expect(filterBy(rows, '  ', (r) => r.name)).toHaveLength(4);
  });
});

describe('stateLevel', () => {
  it('maps states to colors', () => {
    expect(stateLevel('healthy')).toBe('ok');
    expect(stateLevel('unhealthy')).toBe('err');
    expect(stateLevel('starting')).toBe('warn');
    expect(stateLevel('exited')).toBe('dim');
  });
});
