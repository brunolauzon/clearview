import type { AlertInfo, DiskInfo, ProtectEvent, Snapshot, TorrentData } from '@clearview/shared';

/**
 * The disks worth a line in the header: the array total, then pools such as cache, then the fullest
 * data disks (the ones that need attention), up to `max` in all.
 */
export function headerDisks(disks: DiskInfo[], max = 4): { shown: DiskInfo[]; hidden: number } {
  const isData = (d: DiskInfo) => /^disk\d+$/.test(d.name);
  const pools = disks
    .filter((d) => !isData(d))
    .sort((a, b) => Number(b.name === 'user') - Number(a.name === 'user') || a.name.localeCompare(b.name));
  const data = disks.filter(isData).sort((a, b) => b.usedPct - a.usedPct);
  const shown = [...pools, ...data].slice(0, max);
  return { shown, hidden: disks.length - shown.length };
}

/**
 * The middle box shows alerts while there is something to say about them, and torrents otherwise.
 * A failing alert source counts as something to say: it must never be hidden behind download stats.
 */
export function middlePanel(
  alerts: Snapshot<AlertInfo[]> | null,
  torrents: Snapshot<TorrentData> | null,
): 'alerts' | 'torrents' {
  if (!torrents?.configured || !alerts) return 'alerts';
  if (!alerts.configured) return 'torrents';
  if (!alerts.ok) return 'alerts';
  return (alerts.data?.length ?? 0) > 0 ? 'alerts' : 'torrents';
}

/** Text lines the home Plex box holds before it grows taller than its neighbours. */
const PLEX_LINES = 6;
export const PLEX_STREAMS = 4;

/** How many recently added titles fit under the streams in the home Plex box. Streams come first. */
export function recentRoom(streams: number): number {
  const status = 1; // "no active streams", or the transcode and bandwidth summary
  const more = streams > PLEX_STREAMS ? 1 : 0;
  const heading = 1;
  return Math.max(0, PLEX_LINES - status - Math.min(streams, PLEX_STREAMS) - more - heading);
}

/**
 * The camera event worth showing first, from a newest-first list: the latest with something recognised
 * in it, because plain motion is constant; motion only when there is nothing else.
 */
export function headlineEvent(events: ProtectEvent[]): ProtectEvent | null {
  return events.find((e) => !e.motionOnly) ?? events[0] ?? null;
}
