import { describe, expect, it } from 'vitest';
import type { ContainerInfo } from '@clearview/shared';
import { filterBy, sortContainers, stateLevel } from './rows';

const c = (name: string, state: ContainerInfo['state'], uptimeSec: number | null): ContainerInfo => ({
  id: name,
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
  it('does not mutate its input', () => {
    const before = rows.map((r) => r.name);
    sortContainers(rows, 'state');
    expect(rows.map((r) => r.name)).toEqual(before);
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
