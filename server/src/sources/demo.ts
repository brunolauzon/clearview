import type {
  AlertInfo,
  ContainerInfo,
  ContainerStats,
  ContainerState,
  FileConfig,
  HostStats,
  LinkInfo,
  PlexData,
} from '@clearview/shared';
import type { ContainerOverride, GroupRule, LinkConfig } from '../config';
import { groupFor } from './docker';

// Fixtures for CLEARVIEW_DEMO=1: lets the UI be developed and screenshotted without Unraid.

const TB = 1024 ** 4;
const GB = 1024 ** 3;
const started = Date.now();

const demoId = (name: string): string => name.slice(0, 12).padEnd(12, '0');

export function demoHost(): HostStats {
  const t = (Date.now() - started) / 1000;
  const cpu = 22 + 14 * Math.sin(t / 7) + 6 * Math.sin(t / 2.3);
  const mem = 61 + 3 * Math.sin(t / 19);
  const memTotal = 64 * GB;
  const disk = (name: string, mount: string, totalTb: number, pct: number) => ({
    name,
    mount,
    totalBytes: totalTb * TB,
    usedBytes: Math.round(totalTb * TB * (pct / 100)),
    freeBytes: Math.round(totalTb * TB * (1 - pct / 100)),
    usedPct: pct,
  });
  return {
    hostname: 'tower',
    platform: 'Linux 6.12.24-Unraid',
    uptimeSec: 41 * 86400 + 6 * 3600 + 1234 + Math.floor(t),
    cpuPct: Math.round(cpu * 10) / 10,
    cpuCores: 16,
    load: [1.42, 1.18, 0.97],
    mem: { totalBytes: memTotal, usedBytes: Math.round((memTotal * mem) / 100), usedPct: Math.round(mem * 10) / 10 },
    swap: null,
    disks: [
      disk('user', '/mnt/user', 48, 71.4),
      disk('cache', '/mnt/cache', 1.8, 86.2),
      disk('disk1', '/mnt/disk1', 12, 88.9),
      disk('disk2', '/mnt/disk2', 12, 74.1),
      disk('disk3', '/mnt/disk3', 12, 62.7),
      disk('disk4', '/mnt/disk4', 12, 95.3),
    ],
  };
}

interface DemoContainer {
  name: string;
  image: string;
  state: ContainerState;
  port: number | null;
  upDays: number;
}

// The config demo mode starts with. It is editable in the UI like a real clearview.yaml, but lives in memory only.
export const DEMO_FILE_CONFIG: FileConfig = {
  title: 'tower',
  groups: [
    { name: 'Infrastructure', containers: ['grafana', 'prometheus', 'node-exporter', 'pihole', 'mariadb', 'redis', 'watchtower', 'clearview'] },
    { name: 'Media', containers: ['plex', 'tautulli', 'overseerr'] },
    { name: 'Downloads', containers: ['sonarr', 'radarr', 'prowlarr', 'qbittorrent'] },
    { name: 'Home', containers: ['home-assistant'] },
    { name: 'Apps', containers: ['nextcloud', 'immich', 'paperless-ngx', 'vaultwarden'] },
  ],
  links: [
    { name: 'UniFi Controller', url: 'https://192.168.1.2:8443', group: 'network', check: 'http', description: 'Dream Machine' },
    { name: 'Router', url: 'http://192.168.1.1', group: 'network', check: 'http', description: 'Gateway' },
    { name: 'Pi-hole (backup)', url: 'http://192.168.1.53/admin', group: 'network', check: 'http', description: 'Raspberry Pi 4' },
    { name: 'Proxmox', url: 'https://192.168.1.20:8006', group: 'compute', check: 'http', description: 'pve1' },
    { name: 'Synology NAS', url: 'http://192.168.1.30:5000', group: 'storage', check: 'http', description: 'Offsite backup target' },
    { name: 'Printer', url: 'http://192.168.1.60', group: 'devices', check: 'http' },
    { name: 'Hue Bridge', url: 'http://192.168.1.70', group: 'devices', check: 'none' },
  ],
  hide: [],
  overrides: {},
};

const CONTAINERS: DemoContainer[] = [
  { name: 'plex', image: 'lscr.io/linuxserver/plex', state: 'healthy', port: 32400, upDays: 12 },
  { name: 'tautulli', image: 'lscr.io/linuxserver/tautulli', state: 'running', port: 8181, upDays: 12 },
  { name: 'overseerr', image: 'lscr.io/linuxserver/overseerr', state: 'running', port: 5055, upDays: 30 },
  { name: 'sonarr', image: 'lscr.io/linuxserver/sonarr', state: 'healthy', port: 8989, upDays: 12 },
  { name: 'radarr', image: 'lscr.io/linuxserver/radarr', state: 'healthy', port: 7878, upDays: 12 },
  { name: 'prowlarr', image: 'lscr.io/linuxserver/prowlarr', state: 'running', port: 9696, upDays: 12 },
  { name: 'qbittorrent', image: 'lscr.io/linuxserver/qbittorrent', state: 'running', port: 8080, upDays: 5 },
  { name: 'grafana', image: 'grafana/grafana', state: 'running', port: 3000, upDays: 41 },
  { name: 'prometheus', image: 'prom/prometheus', state: 'running', port: 9090, upDays: 41 },
  { name: 'node-exporter', image: 'prom/node-exporter', state: 'running', port: null, upDays: 41 },
  { name: 'home-assistant', image: 'ghcr.io/home-assistant/home-assistant', state: 'running', port: 8123, upDays: 19 },
  { name: 'pihole', image: 'pihole/pihole', state: 'healthy', port: 8053, upDays: 41 },
  { name: 'vaultwarden', image: 'vaultwarden/server', state: 'healthy', port: 8222, upDays: 41 },
  { name: 'nextcloud', image: 'lscr.io/linuxserver/nextcloud', state: 'running', port: 8443, upDays: 8 },
  { name: 'immich', image: 'ghcr.io/immich-app/immich-server', state: 'unhealthy', port: 2283, upDays: 0 },
  { name: 'paperless-ngx', image: 'ghcr.io/paperless-ngx/paperless-ngx', state: 'starting', port: 8000, upDays: 0 },
  { name: 'syncthing', image: 'lscr.io/linuxserver/syncthing', state: 'running', port: 8384, upDays: 41 },
  { name: 'duplicati', image: 'lscr.io/linuxserver/duplicati', state: 'exited', port: 8200, upDays: -1 },
  { name: 'mariadb', image: 'mariadb:11', state: 'healthy', port: null, upDays: 41 },
  { name: 'redis', image: 'redis:7-alpine', state: 'running', port: null, upDays: 41 },
  { name: 'watchtower', image: 'containrrr/watchtower', state: 'running', port: null, upDays: 41 },
  { name: 'clearview', image: 'clearview:latest', state: 'running', port: 7878, upDays: 0 },
];

export function demoContainers(opts: {
  hide: string[];
  overrides: Record<string, ContainerOverride>;
  groups: GroupRule[];
}): ContainerInfo[] {
  const now = Date.now();
  return CONTAINERS.filter((c) => !opts.hide.includes(c.name) && !opts.overrides[c.name]?.hide)
    .map((c) => {
      const override = opts.overrides[c.name] ?? {};
      const alive = c.state !== 'exited';
      const upSec = alive ? Math.max(95, c.upDays * 86400 + 3600) : null;
      return {
        id: demoId(c.name),
        rawName: c.name,
        name: override.name || c.name,
        image: c.image,
        state: c.state,
        statusText: alive ? `Up ${c.upDays} days` : 'Exited (0) 2 days ago',
        startedAt: upSec ? new Date(now - upSec * 1000).toISOString() : null,
        uptimeSec: upSec,
        ports: c.port ? [{ private: c.port, public: c.port, proto: 'tcp' as const }] : [],
        url: override.url || (c.port ? `http://[IP]:${c.port}/` : null),
        icon: null,
        group: override.group || groupFor(c.name, opts.groups),
        managed: true,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function demoAlerts(): AlertInfo[] {
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  return [
    {
      id: 'a1',
      name: 'Array disk4 usage above 95%',
      severity: 'critical',
      startsAt: ago(190),
      summary: 'disk4 is at 95.3% (4.6 TB used of 12 TB)',
      url: 'http://[IP]:3000/alerting/list',
      labels: { alertname: 'Array disk4 usage above 95%', severity: 'critical', instance: 'tower' },
    },
    {
      id: 'a2',
      name: 'Container immich unhealthy',
      severity: 'warning',
      startsAt: ago(42),
      summary: 'Healthcheck failing for 6 consecutive checks',
      url: 'http://[IP]:3000/alerting/list',
      labels: { alertname: 'Container immich unhealthy', severity: 'warning' },
    },
    {
      id: 'a3',
      name: 'Cache pool usage above 85%',
      severity: 'warning',
      startsAt: ago(1500),
      summary: 'cache is at 86.2%. Run the mover or clear appdata backups.',
      url: 'http://[IP]:3000/alerting/list',
      labels: { alertname: 'Cache pool usage above 85%', severity: 'warning' },
    },
  ];
}

export function demoPlex(): PlexData {
  const t = Math.floor((Date.now() - started) / 1000);
  const streams: PlexData['streams'] = [
    {
      id: '1',
      user: 'alice',
      title: 'Dune: Part Two',
      mediaType: 'movie',
      player: 'Apple TV',
      platform: 'tvOS',
      state: 'playing',
      decision: 'transcode',
      quality: '1080p (8 Mbps)',
      progressPct: Math.min(99, 42 + t / 30),
      bandwidthKbps: 8200,
      location: 'wan',
    },
    {
      id: '2',
      user: 'bob',
      title: 'Severance - Hello, Ms. Cobel',
      mediaType: 'episode',
      player: 'Living Room',
      platform: 'Android TV',
      state: 'playing',
      decision: 'direct play',
      quality: '4K (Original)',
      progressPct: Math.min(99, 18 + t / 40),
      bandwidthKbps: 31400,
      location: 'lan',
    },
    {
      id: '3',
      user: 'carol',
      title: 'The Bear - Honeydew',
      mediaType: 'episode',
      player: 'Chrome',
      platform: 'Windows',
      state: 'paused',
      decision: 'direct stream',
      quality: '1080p (Original)',
      progressPct: 67,
      bandwidthKbps: 0,
      location: 'lan',
    },
  ];
  const mins = (m: number) => Math.floor(Date.now() / 1000) - m * 60;
  return {
    streams,
    streamCount: 3,
    transcodeCount: 1,
    totalBandwidthKbps: 39600,
    lanBandwidthKbps: 31400,
    wanBandwidthKbps: 8200,
    libraries: [
      { name: 'Movies', type: 'movie', count: 1284, childCount: null },
      { name: 'TV Shows', type: 'show', count: 142, childCount: 6931 },
      { name: 'Anime', type: 'show', count: 37, childCount: 1204 },
      { name: 'Music', type: 'artist', count: 411, childCount: 5120 },
    ],
    history: [
      { user: 'bob', title: 'Andor - Reckoning', mediaType: 'episode', player: 'Living Room', stoppedAt: mins(95), percentComplete: 100 },
      { user: 'alice', title: 'Arrival', mediaType: 'movie', player: 'Apple TV', stoppedAt: mins(300), percentComplete: 98 },
      { user: 'carol', title: 'The Bear - Forks', mediaType: 'episode', player: 'Chrome', stoppedAt: mins(1440), percentComplete: 100 },
      { user: 'dave', title: 'Spirited Away', mediaType: 'movie', player: 'iPad', stoppedAt: mins(2900), percentComplete: 61 },
    ],
    top: [
      { id: 'top_users', title: 'top users', rows: [{ label: 'bob', plays: 142 }, { label: 'alice', plays: 97 }, { label: 'carol', plays: 61 }] },
      { id: 'top_movies', title: 'top movies', rows: [{ label: 'Dune: Part Two', plays: 9 }, { label: 'Arrival', plays: 7 }, { label: 'Spirited Away', plays: 6 }] },
      { id: 'top_tv', title: 'top shows', rows: [{ label: 'Severance', plays: 38 }, { label: 'The Bear', plays: 31 }, { label: 'Andor', plays: 24 }] },
    ],
  };
}

// [cpu % of one core, memory in MB, memory limit in GB (default: the 64 GB host)]
const LOAD: Record<string, [number, number, number?]> = {
  plex: [22, 2150],
  immich: [48, 3600, 6],
  'paperless-ngx': [14, 700, 4],
  qbittorrent: [9, 640],
  nextcloud: [4, 820],
  prometheus: [3.2, 540],
  sonarr: [2.4, 310],
  'home-assistant': [2.1, 460],
  radarr: [1.8, 290],
  grafana: [1.4, 210],
  mariadb: [1.1, 380],
  prowlarr: [0.9, 180],
  syncthing: [0.8, 130],
  tautulli: [0.7, 150],
  pihole: [0.6, 90],
  overseerr: [0.5, 260],
  clearview: [0.5, 65],
  'node-exporter': [0.4, 22],
  redis: [0.3, 24],
  vaultwarden: [0.2, 45],
  watchtower: [0.1, 18],
};

export function demoStats(): Record<string, ContainerStats> {
  const t = (Date.now() - started) / 1000;
  const out: Record<string, ContainerStats> = {};
  CONTAINERS.forEach((c, i) => {
    if (c.state === 'exited') return;
    const [cpu, memMb, limitGb] = LOAD[c.name] ?? [0.2, 40];
    const wobble = 1 + 0.35 * Math.sin(t / (3 + (i % 5)) + i);
    const memBytes = Math.round(memMb * 1024 ** 2 * (1 + 0.02 * Math.sin(t / 11 + i)));
    const memLimitBytes = (limitGb ?? 64) * GB;
    out[demoId(c.name)] = {
      cpuPct: Math.round(cpu * wobble * 10) / 10,
      memBytes,
      memLimitBytes,
      memPct: Math.round((memBytes / memLimitBytes) * 1000) / 10,
    };
  });
  return out;
}

const DEMO_DOWN = new Set(['Synology NAS']);

export function demoLinks(links: LinkConfig[]): LinkInfo[] {
  const hash = (text: string) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return links
    .map((l) => {
      const up = l.check === 'none' ? null : !DEMO_DOWN.has(l.name);
      return {
        name: l.name,
        url: l.url,
        group: l.group,
        icon: l.icon ?? null,
        description: l.description ?? null,
        check: l.check,
        up,
        latencyMs: up ? 3 + (hash(l.name) % 110) : null,
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}
