import { describe, expect, it } from 'vitest';
import type { AlertInfo, DiskInfo, Snapshot, TorrentData } from '@clearview/shared';
import { headerDisks, middlePanel } from './panels';

const disk = (name: string, usedPct: number): DiskInfo => ({ name, mount: `/mnt/${name}`, totalBytes: 100, usedBytes: usedPct, freeBytes: 100 - usedPct, usedPct });

describe('headerDisks', () => {
  const unraid = [disk('disk1', 88), disk('disk2', 74), disk('disk3', 62), disk('disk4', 95), disk('cache', 86), disk('user', 71)];

  it('puts the array total and pools first, then the fullest data disks', () => {
    const out = headerDisks(unraid);
    expect(out.shown.map((d) => d.name)).toEqual(['user', 'cache', 'disk4', 'disk1']);
    expect(out.hidden).toBe(2);
  });

  it('shows everything when it fits', () => {
    expect(headerDisks([disk('home', 50)])).toEqual({ shown: [disk('home', 50)], hidden: 0 });
    expect(headerDisks([])).toEqual({ shown: [], hidden: 0 });
  });

  it('keeps pools in name order and respects the limit', () => {
    const out = headerDisks([disk('nvme', 1), disk('cache', 2), disk('user', 3), disk('disk1', 4)], 3);
    expect(out.shown.map((d) => d.name)).toEqual(['user', 'cache', 'nvme']);
    expect(out.hidden).toBe(1);
  });
});

describe('middlePanel', () => {
  const snap = <T>(data: T | null, over: Partial<Snapshot<T>> = {}): Snapshot<T> => ({ configured: true, ok: true, error: null, at: 0, data, ...over });
  const alert = { id: 'a', name: 'x', severity: 'warning', startsAt: '', summary: null, url: null, labels: {} } as AlertInfo;
  const torrents = snap<TorrentData>(null);
  const noTorrents = snap<TorrentData>(null, { configured: false });

  it('shows alerts while any are firing', () => {
    expect(middlePanel(snap([alert]), torrents)).toBe('alerts');
  });
  it('shows torrents when nothing is firing, or Grafana is not set up', () => {
    expect(middlePanel(snap<AlertInfo[]>([]), torrents)).toBe('torrents');
    expect(middlePanel(snap<AlertInfo[]>(null, { configured: false }), torrents)).toBe('torrents');
  });
  it('never hides a broken or still-loading alert source behind torrents', () => {
    expect(middlePanel(snap<AlertInfo[]>([], { ok: false, error: 'down' }), torrents)).toBe('alerts');
    expect(middlePanel(null, torrents)).toBe('alerts');
  });
  it('keeps the alerts box when there is no torrent client', () => {
    expect(middlePanel(snap<AlertInfo[]>([]), noTorrents)).toBe('alerts');
    expect(middlePanel(snap<AlertInfo[]>([]), null)).toBe('alerts');
  });
});
