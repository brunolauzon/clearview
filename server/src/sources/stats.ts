import type { ContainerStats } from '@clearview/shared';
import { mapLimit, round1, sleep } from '../util';
import type { DockerClient } from './docker';

/** The fields of `GET /containers/{id}/stats` that we read. */
export interface RawStats {
  cpu_stats?: {
    cpu_usage?: { total_usage?: number; percpu_usage?: number[] };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  memory_stats?: {
    usage?: number;
    limit?: number;
    stats?: Record<string, number>;
  };
}

export interface Sample {
  at: number;
  cpuTotal: number;
  systemTotal: number;
  cpus: number;
  memUsed: number;
  memLimit: number;
}

export function parseStats(raw: RawStats, at = Date.now()): Sample {
  const cpu = raw.cpu_stats;
  const mem = raw.memory_stats;
  const usage = mem?.usage ?? 0;
  // `docker stats` hides reclaimable page cache: cgroup v1 reports total_inactive_file, v2 inactive_file
  const cache = mem?.stats?.total_inactive_file ?? mem?.stats?.inactive_file ?? 0;
  return {
    at,
    cpuTotal: cpu?.cpu_usage?.total_usage ?? 0,
    systemTotal: cpu?.system_cpu_usage ?? 0,
    cpus: cpu?.online_cpus || cpu?.cpu_usage?.percpu_usage?.length || 1,
    memUsed: cache < usage ? usage - cache : usage,
    memLimit: mem?.limit ?? 0,
  };
}

/** Same formula as the Docker CLI: share of host CPU time used, scaled to cores. Null if the counters went backwards (restart). */
export function containerCpuPct(prev: Sample, cur: Sample): number | null {
  const cpuDelta = cur.cpuTotal - prev.cpuTotal;
  const systemDelta = cur.systemTotal - prev.systemTotal;
  if (cpuDelta < 0 || systemDelta <= 0) return null;
  return round1((cpuDelta / systemDelta) * cur.cpus * 100);
}

export function toStats(prev: Sample, cur: Sample): ContainerStats {
  return {
    cpuPct: containerCpuPct(prev, cur),
    memBytes: cur.memUsed,
    memLimitBytes: cur.memLimit,
    memPct: cur.memLimit > 0 ? round1((cur.memUsed / cur.memLimit) * 100) : 0,
  };
}

interface Options {
  /** wait between the two samples taken for a container we have not seen before */
  primeDelayMs: number;
  /** a previous sample older than this is not used as a baseline */
  staleMs: number;
}

/**
 * Per-container CPU and memory. CPU needs two samples, so each poll is compared with the previous
 * one. `one-shot` makes each Docker call return immediately instead of blocking for a second.
 */
export class StatsCollector {
  private prev = new Map<string, Sample>();
  private opts: Options;

  constructor(
    private docker: Pick<DockerClient, 'get'>,
    opts: Partial<Options> = {},
  ) {
    this.opts = { primeDelayMs: 500, staleMs: 30_000, ...opts };
  }

  private async sample(id: string): Promise<Sample | null> {
    try {
      return parseStats(await this.docker.get<RawStats>(`/containers/${id}/stats?stream=false&one-shot=true`, 8000));
    } catch {
      return null; // the container may have stopped between the list and the stats call
    }
  }

  /** Keyed by the 12-character container id, like ContainerInfo.id. Only running containers appear. */
  async collect(): Promise<Record<string, ContainerStats>> {
    const running = await this.docker.get<{ Id: string }[]>('/containers/json');
    const out: Record<string, ContainerStats> = {};
    const next = new Map<string, Sample>();

    await mapLimit(running, 8, async ({ Id }) => {
      let prev = this.prev.get(Id) ?? null;
      if (prev && Date.now() - prev.at > this.opts.staleMs) prev = null;

      let cur = await this.sample(Id);
      if (!cur) return;
      if (!prev) {
        // first sighting: take a second sample shortly after so CPU is not blank for a whole poll
        prev = cur;
        await sleep(this.opts.primeDelayMs);
        cur = await this.sample(Id);
        if (!cur) return;
      }
      next.set(Id, cur);
      out[Id.slice(0, 12)] = toStats(prev, cur);
    });

    this.prev = next; // forgets containers that stopped
    return out;
  }
}
