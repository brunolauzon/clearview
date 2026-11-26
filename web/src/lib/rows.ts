import type { ContainerInfo, ContainerState, ContainerStats } from '@clearview/shared';
import type { Level } from './format';

export function filterBy<T>(rows: T[], query: string, haystack: (row: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => haystack(r).toLowerCase().includes(q));
}

export type SortKey = 'group' | 'name' | 'state' | 'age' | 'cpu' | 'mem';
/** order the `s` key cycles through; the first one is the default */
export const SORT_KEYS: SortKey[] = ['group', 'name', 'state', 'age', 'cpu', 'mem'];

/** Live usage keyed by ContainerInfo.id. */
export type StatsMap = Record<string, ContainerStats>;

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

/**
 * Categories listed in `groupOrder` come first in that order, then any other category
 * alphabetically (e.g. from a container label), then containers with no category.
 */
function groupRank(group: string | null, groupOrder: string[]): number {
  if (group === null) return 1e9;
  const i = groupOrder.indexOf(group);
  return i >= 0 ? i : 1e6;
}

export function sortContainers(
  rows: ContainerInfo[],
  key: SortKey,
  stats: StatsMap = {},
  groupOrder: string[] = [],
): ContainerInfo[] {
  const byName = (a: ContainerInfo, b: ContainerInfo) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const copy = [...rows];
  if (key === 'group') {
    return copy.sort(
      (a, b) =>
        groupRank(a.group, groupOrder) - groupRank(b.group, groupOrder) ||
        (a.group ?? '').localeCompare(b.group ?? '', undefined, { sensitivity: 'base' }) ||
        byName(a, b),
    );
  }
  if (key === 'state') return copy.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || byName(a, b));
  if (key === 'age') return copy.sort((a, b) => (a.uptimeSec ?? Infinity) - (b.uptimeSec ?? Infinity) || byName(a, b));
  // busiest first; containers with no sample (stopped, or CPU not measured yet) go last
  if (key === 'cpu') return copy.sort((a, b) => (stats[b.id]?.cpuPct ?? -1) - (stats[a.id]?.cpuPct ?? -1) || byName(a, b));
  if (key === 'mem') return copy.sort((a, b) => (stats[b.id]?.memBytes ?? -1) - (stats[a.id]?.memBytes ?? -1) || byName(a, b));
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
