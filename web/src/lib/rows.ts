import type { ContainerInfo, ContainerState } from '@clearview/shared';
import type { Level } from './format';

export function filterBy<T>(rows: T[], query: string, haystack: (row: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => haystack(r).toLowerCase().includes(q));
}

export type SortKey = 'name' | 'state' | 'age';
export const SORT_KEYS: SortKey[] = ['name', 'state', 'age'];

/** Problems float to the top when sorting by state. */
const STATE_RANK: Record<ContainerState, number> = {
  unhealthy: 0,
  restarting: 1,
  dead: 2,
  exited: 3,
  paused: 4,
  starting: 5,
  created: 6,
  removing: 7,
  running: 8,
  healthy: 9,
};

export function sortContainers(rows: ContainerInfo[], key: SortKey): ContainerInfo[] {
  const byName = (a: ContainerInfo, b: ContainerInfo) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const copy = [...rows];
  if (key === 'state') return copy.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || byName(a, b));
  if (key === 'age') return copy.sort((a, b) => (a.uptimeSec ?? Infinity) - (b.uptimeSec ?? Infinity) || byName(a, b));
  return copy.sort(byName);
}

export function stateLevel(state: ContainerState): Level | 'dim' | 'info' {
  switch (state) {
    case 'running':
    case 'healthy':
      return 'ok';
    case 'unhealthy':
    case 'dead':
    case 'restarting':
      return 'err';
    case 'starting':
    case 'paused':
    case 'created':
    case 'removing':
      return 'warn';
    case 'exited':
      return 'dim';
  }
}

export function containerSearchText(c: ContainerInfo): string {
  return `${c.name} ${c.image} ${c.state} ${c.group ?? ''}`;
}
