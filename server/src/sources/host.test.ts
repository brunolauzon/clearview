import { describe, expect, it } from 'vitest';
import { cpuPct, diskRank, parseMeminfo, parseProcStat } from './host';

const PROC_STAT = `cpu  4705 150 1120 16250 520 0 30 0 0 0
cpu0 1175 37 280 4060 130 0 7 0 0 0
intr 12345
`;

const MEMINFO = `MemTotal:       65843200 kB
MemFree:         1203456 kB
MemAvailable:   40123456 kB
Buffers:          123456 kB
SwapTotal:       2097148 kB
SwapFree:        2097000 kB
`;

describe('parseProcStat', () => {
  it('sums busy and idle time from the aggregate cpu line', () => {
    expect(parseProcStat(PROC_STAT)).toEqual({ idle: 16770, total: 22775 });
  });
  it('returns null for garbage', () => {
    expect(parseProcStat('nothing here')).toBeNull();
    expect(parseProcStat('cpu  a b c d')).toBeNull();
  });
});

describe('cpuPct', () => {
  it('is busy time over total time between two samples', () => {
    expect(cpuPct({ idle: 16770, total: 22775 }, { idle: 16870, total: 23075 })).toBe(66.7);
  });
  it('is 0 when no time passed', () => {
    expect(cpuPct({ idle: 1, total: 10 }, { idle: 1, total: 10 })).toBe(0);
  });
});

describe('parseMeminfo', () => {
  it('uses MemAvailable, not MemFree, and converts kB to bytes', () => {
    const m = parseMeminfo(MEMINFO)!;
    expect(m.totalBytes).toBe(65843200 * 1024);
    expect(m.availableBytes).toBe(40123456 * 1024);
    expect(m.swapTotalBytes).toBe(2097148 * 1024);
  });
  it('falls back to MemFree on old kernels', () => {
    expect(parseMeminfo('MemTotal: 100 kB\nMemFree: 40 kB\n')!.availableBytes).toBe(40 * 1024);
  });
  it('returns null when MemTotal is missing', () => {
    expect(parseMeminfo('Buffers: 1 kB')).toBeNull();
  });
});

describe('diskRank', () => {
  it('orders array total, then pools, then numbered disks', () => {
    const names = ['disk10', 'disk2', 'nvme', 'user', 'cache', 'disk1'];
    const sorted = [...names].sort((a, b) => diskRank(a) - diskRank(b) || a.localeCompare(b));
    expect(sorted).toEqual(['user', 'cache', 'nvme', 'disk1', 'disk2', 'disk10']);
  });
});
