import { describe, expect, it } from 'vitest';
import { containerCpuPct, parseStats, StatsCollector, toStats, type RawStats, type Sample } from './stats';

const MB = 1024 ** 2;
const GB = 1024 ** 3;

const sample = (over: Partial<Sample> = {}): Sample => ({
  at: 0,
  cpuTotal: 1e9,
  systemTotal: 4e9,
  cpus: 4,
  memUsed: 0,
  memLimit: 0,
  ...over,
});

describe('parseStats', () => {
  it('subtracts reclaimable cache on cgroup v2 (inactive_file)', () => {
    const raw: RawStats = {
      cpu_stats: { cpu_usage: { total_usage: 2e9 }, system_cpu_usage: 8e9, online_cpus: 4 },
      memory_stats: { usage: 500 * MB, limit: 8 * GB, stats: { inactive_file: 100 * MB } },
    };
    expect(parseStats(raw, 5)).toEqual({ at: 5, cpuTotal: 2e9, systemTotal: 8e9, cpus: 4, memUsed: 400 * MB, memLimit: 8 * GB });
  });

  it('prefers total_inactive_file on cgroup v1', () => {
    const raw: RawStats = {
      memory_stats: { usage: 300 * MB, limit: GB, stats: { total_inactive_file: 50 * MB, inactive_file: 10 * MB, cache: 70 * MB } },
    };
    expect(parseStats(raw).memUsed).toBe(250 * MB);
  });

  it('keeps usage as is when the cache figure is larger than usage', () => {
    expect(parseStats({ memory_stats: { usage: 10 * MB, stats: { inactive_file: 20 * MB } } }).memUsed).toBe(10 * MB);
  });

  it('falls back to percpu_usage length, then 1, for the core count', () => {
    expect(parseStats({ cpu_stats: { cpu_usage: { percpu_usage: [1, 2, 3] } } }).cpus).toBe(3);
    expect(parseStats({}).cpus).toBe(1);
  });

  it('copes with an empty response', () => {
    expect(parseStats({}, 1)).toEqual({ at: 1, cpuTotal: 0, systemTotal: 0, cpus: 1, memUsed: 0, memLimit: 0 });
  });
});

describe('containerCpuPct', () => {
  it('matches the Docker CLI formula: one full core on a 4-core host is 100%', () => {
    const prev = sample({ cpuTotal: 1e9, systemTotal: 4e9 });
    const cur = sample({ cpuTotal: 2e9, systemTotal: 8e9 });
    expect(containerCpuPct(prev, cur)).toBe(100);
  });

  it('can exceed 100% when more than one core is busy', () => {
    expect(containerCpuPct(sample({ cpuTotal: 0, systemTotal: 0 }), sample({ cpuTotal: 3e9, systemTotal: 4e9 }))).toBe(300);
  });

  it('is null when counters go backwards (container restarted) or no system time passed', () => {
    expect(containerCpuPct(sample({ cpuTotal: 5e9 }), sample({ cpuTotal: 1e9, systemTotal: 9e9 }))).toBeNull();
    expect(containerCpuPct(sample(), sample())).toBeNull();
  });
});

describe('toStats', () => {
  it('computes memory percent of the limit', () => {
    const out = toStats(sample(), sample({ cpuTotal: 1e9, systemTotal: 8e9, memUsed: 256 * MB, memLimit: GB }));
    expect(out).toMatchObject({ memBytes: 256 * MB, memLimitBytes: GB, memPct: 25 });
  });
  it('reports 0% when there is no limit', () => {
    expect(toStats(sample(), sample({ systemTotal: 8e9, memUsed: MB, memLimit: 0 })).memPct).toBe(0);
  });
});

/** Fake Docker: every stats call advances that container's counters, so deltas are predictable. */
function fakeDocker(ids: string[], cpuPerCall: Record<string, number>) {
  const calls = new Map<string, number>();
  const failing = new Set<string>();
  return {
    ids,
    failing,
    async get<T>(path: string): Promise<T> {
      if (path === '/containers/json') return ids.map((Id) => ({ Id })) as T;
      const m = path.match(/^\/containers\/(\w+)\/stats\?stream=false&one-shot=true$/);
      if (!m) throw new Error(`unexpected path ${path}`);
      const id = m[1]!;
      if (failing.has(id)) throw new Error('gone');
      const n = (calls.get(id) ?? 0) + 1;
      calls.set(id, n);
      const raw: RawStats = {
        cpu_stats: { cpu_usage: { total_usage: n * (cpuPerCall[id] ?? 0) }, system_cpu_usage: n * 4e9, online_cpus: 4 },
        memory_stats: { usage: 300 * MB, limit: GB, stats: { inactive_file: 44 * MB } },
      };
      return raw as T;
    },
  };
}

describe('StatsCollector', () => {
  const A = 'a'.repeat(64);
  const B = 'b'.repeat(64);

  it('primes new containers with a second sample, keyed by the short id', async () => {
    const docker = fakeDocker([A, B], { [A]: 1e9, [B]: 0.1e9 });
    const out = await new StatsCollector(docker, { primeDelayMs: 1 }).collect();
    expect(Object.keys(out).sort()).toEqual(['a'.repeat(12), 'b'.repeat(12)]);
    expect(out['a'.repeat(12)]).toEqual({ cpuPct: 100, memBytes: 256 * MB, memLimitBytes: GB, memPct: 25 });
    expect(out['b'.repeat(12)]!.cpuPct).toBe(10);
  });

  it('compares each poll with the previous one and forgets stopped containers', async () => {
    const docker = fakeDocker([A, B], { [A]: 2e9, [B]: 0 });
    const collector = new StatsCollector(docker, { primeDelayMs: 1 });
    await collector.collect();
    docker.ids.splice(1, 1); // B stops
    const second = await collector.collect();
    expect(Object.keys(second)).toEqual(['a'.repeat(12)]);
    expect(second['a'.repeat(12)]!.cpuPct).toBe(200);
  });

  it('skips a container whose stats call fails without failing the poll', async () => {
    const docker = fakeDocker([A, B], { [A]: 1e9, [B]: 1e9 });
    docker.failing.add(B);
    const out = await new StatsCollector(docker, { primeDelayMs: 1 }).collect();
    expect(Object.keys(out)).toEqual(['a'.repeat(12)]);
  });

  it('does not use a stale baseline', async () => {
    const docker = fakeDocker([A], { [A]: 1e9 });
    const collector = new StatsCollector(docker, { primeDelayMs: 1, staleMs: -1 }); // every baseline counts as stale
    await collector.collect();
    const out = await collector.collect();
    // re-primed: both samples came from consecutive calls, so the delta is one call's worth, not two
    expect(out['a'.repeat(12)]!.cpuPct).toBe(100);
  });
});
