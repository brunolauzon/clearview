import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DiskInfo, HostStats } from '@clearview/shared';
import type { AppConfig } from '../config';
import { clamp, round1, sleep } from '../util';

export interface CpuTimes {
  idle: number;
  total: number;
}

/** First line of /proc/stat: `cpu user nice system idle iowait irq softirq steal guest guest_nice` */
export function parseProcStat(text: string): CpuTimes | null {
  const line = text.split('\n').find((l) => l.startsWith('cpu '));
  if (!line) return null;
  const n = line.trim().split(/\s+/).slice(1).map(Number);
  if (n.length < 4 || n.some(Number.isNaN)) return null;
  const idle = (n[3] ?? 0) + (n[4] ?? 0);
  // guest time is already counted inside user/nice, so only sum the first 8 fields
  const total = n.slice(0, 8).reduce((a, b) => a + b, 0);
  return { idle, total };
}

export function cpuPct(prev: CpuTimes, cur: CpuTimes): number {
  const dt = cur.total - prev.total;
  const di = cur.idle - prev.idle;
  if (dt <= 0) return 0;
  return round1(clamp((1 - di / dt) * 100, 0, 100));
}

export interface MemInfo {
  totalBytes: number;
  availableBytes: number;
  swapTotalBytes: number;
  swapFreeBytes: number;
}

export function parseMeminfo(text: string): MemInfo | null {
  const kb = (key: string): number | null => {
    const m = text.match(new RegExp(`^${key}:\\s+(\\d+)\\s*kB`, 'm'));
    return m ? Number(m[1]) * 1024 : null;
  };
  const total = kb('MemTotal');
  const available = kb('MemAvailable') ?? kb('MemFree');
  if (total === null || available === null) return null;
  return {
    totalBytes: total,
    availableBytes: available,
    swapTotalBytes: kb('SwapTotal') ?? 0,
    swapFreeBytes: kb('SwapFree') ?? 0,
  };
}

const NON_DISK = new Set(['user0', 'disks', 'remotes', 'addons', 'rootshare']);

/** Array total first, then cache pools, then data disks in numeric order. */
export function diskRank(name: string): number {
  if (name === 'user') return 0;
  const m = name.match(/^disk(\d+)$/);
  if (m) return 2 + Number(m[1]) / 1000;
  return 1;
}

async function statDisk(name: string, mount: string): Promise<DiskInfo | null> {
  try {
    const s = await fs.statfs(mount);
    const total = s.blocks * s.bsize;
    if (total === 0) return null;
    const free = s.bavail * s.bsize;
    const used = (s.blocks - s.bfree) * s.bsize;
    // same definition as `df`: used / (used + available)
    const usedPct = used + free > 0 ? round1((used / (used + free)) * 100) : 0;
    return { name, mount, totalBytes: total, usedBytes: used, freeBytes: free, usedPct };
  } catch {
    return null;
  }
}

async function discoverDisks(cfg: Pick<AppConfig, 'disksRoot' | 'disks'>): Promise<{ name: string; path: string }[]> {
  if (cfg.disks) return cfg.disks;
  try {
    const entries = await fs.readdir(cfg.disksRoot, { withFileTypes: true });
    return entries
      .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !NON_DISK.has(e.name) && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, path: path.join(cfg.disksRoot, e.name) }))
      .sort((a, b) => diskRank(a.name) - diskRank(b.name) || a.name.localeCompare(b.name));
  } catch {
    // not on Unraid (e.g. developing on a laptop): show the home volume
    return [{ name: 'home', path: os.homedir() }];
  }
}

function osCpuTimes(): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}

async function readCpuTimes(): Promise<CpuTimes> {
  try {
    const parsed = parseProcStat(await fs.readFile('/proc/stat', 'utf8'));
    if (parsed) return parsed;
  } catch {
    /* not Linux */
  }
  return osCpuTimes();
}

async function readMem(): Promise<MemInfo> {
  try {
    const parsed = parseMeminfo(await fs.readFile('/proc/meminfo', 'utf8'));
    if (parsed) return parsed;
  } catch {
    /* not Linux */
  }
  return { totalBytes: os.totalmem(), availableBytes: os.freemem(), swapTotalBytes: 0, swapFreeBytes: 0 };
}

export class HostCollector {
  private prev: CpuTimes | null = null;

  constructor(private cfg: Pick<AppConfig, 'disksRoot' | 'disks' | 'hostName'>) {}

  async collect(): Promise<HostStats> {
    let cur = await readCpuTimes();
    if (!this.prev) {
      // no baseline yet: take a short sample so the first paint is not 0%
      this.prev = cur;
      await sleep(250);
      cur = await readCpuTimes();
    }
    const cpu = cpuPct(this.prev, cur);
    this.prev = cur;

    const mem = await readMem();
    const used = mem.totalBytes - mem.availableBytes;
    const swapUsed = mem.swapTotalBytes - mem.swapFreeBytes;

    const targets = await discoverDisks(this.cfg);
    const disks = (await Promise.all(targets.map((t) => statDisk(t.name, t.path)))).filter((d): d is DiskInfo => d !== null);

    const [l1, l5, l15] = os.loadavg();
    return {
      hostname: this.cfg.hostName ?? os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      uptimeSec: Math.floor(os.uptime()),
      cpuPct: cpu,
      cpuCores: os.cpus().length,
      load: [round1(l1 ?? 0), round1(l5 ?? 0), round1(l15 ?? 0)],
      mem: { totalBytes: mem.totalBytes, usedBytes: used, usedPct: round1((used / mem.totalBytes) * 100) },
      swap:
        mem.swapTotalBytes > 0
          ? { totalBytes: mem.swapTotalBytes, usedBytes: swapUsed, usedPct: round1((swapUsed / mem.swapTotalBytes) * 100) }
          : null,
      disks,
    };
  }
}
