import type {
  AlertInfo,
  ContainerInfo,
  ContainerState,
  HostStats,
  LinkInfo,
  PlexData,
} from '@clearview/shared';

// Fixtures for CLEARVIEW_DEMO=1: lets the UI be developed and screenshotted without Unraid.

const TB = 1024 ** 4;
const GB = 1024 ** 3;
const started = Date.now();

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
  group?: string;
}

const CONTAINERS: DemoContainer[] = [
  { name: 'plex', image: 'lscr.io/linuxserver/plex', state: 'healthy', port: 32400, upDays: 12, group: 'media' },
  { name: 'tautulli', image: 'lscr.io/linuxserver/tautulli', state: 'running', port: 8181, upDays: 12, group: 'media' },
  { name: 'overseerr', image: 'lscr.io/linuxserver/overseerr', state: 'running', port: 5055, upDays: 30, group: 'media' },
  { name: 'sonarr', image: 'lscr.io/linuxserver/sonarr', state: 'healthy', port: 8989, upDays: 12, group: 'arr' },
  { name: 'radarr', image: 'lscr.io/linuxserver/radarr', state: 'healthy', port: 7878, upDays: 12, group: 'arr' },
  { name: 'prowlarr', image: 'lscr.io/linuxserver/prowlarr', state: 'running', port: 9696, upDays: 12, group: 'arr' },
  { name: 'qbittorrent', image: 'lscr.io/linuxserver/qbittorrent', state: 'running', port: 8080, upDays: 5, group: 'arr' },
  { name: 'grafana', image: 'grafana/grafana', state: 'running', port: 3000, upDays: 41, group: 'monitoring' },
  { name: 'prometheus', image: 'prom/prometheus', state: 'running', port: 9090, upDays: 41, group: 'monitoring' },
  { name: 'node-exporter', image: 'prom/node-exporter', state: 'running', port: null, upDays: 41, group: 'monitoring' },
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

export function demoContainers(): ContainerInfo[] {
  const now = Date.now();
  return CONTAINERS.map((c) => {
    const alive = c.state !== 'exited';
    const upSec = alive ? Math.max(95, c.upDays * 86400 + 3600) : null;
    return {
      id: c.name.slice(0, 12).padEnd(12, '0'),
      name: c.name,
      image: c.image,
      state: c.state,
      statusText: alive ? `Up ${c.upDays} days` : 'Exited (0) 2 days ago',
      startedAt: upSec ? new Date(now - upSec * 1000).toISOString() : null,
      uptimeSec: upSec,
      ports: c.port ? [{ private: c.port, public: c.port, proto: 'tcp' }] : [],
      url: c.port ? `http://[IP]:${c.port}/` : null,
      icon: null,
      group: c.group ?? null,
      managed: true,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
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

export function demoLinks(): LinkInfo[] {
  const l = (name: string, url: string, group: string, up: boolean | null, ms: number | null, description: string | null = null): LinkInfo => ({
    name,
    url,
    group,
    icon: null,
    description,
    check: up === null ? 'none' : 'http',
    up,
    latencyMs: ms,
  });
  return [
    l('UniFi Controller', 'https://192.168.1.2:8443', 'network', true, 18, 'Dream Machine'),
    l('Router', 'http://192.168.1.1', 'network', true, 3, 'Gateway'),
    l('Pi-hole (backup)', 'http://192.168.1.53/admin', 'network', true, 9, 'Raspberry Pi 4'),
    l('Proxmox', 'https://192.168.1.20:8006', 'compute', true, 41, 'pve1'),
    l('Synology NAS', 'http://192.168.1.30:5000', 'storage', false, null, 'Offsite backup target'),
    l('Printer', 'http://192.168.1.60', 'devices', true, 112),
    l('Hue Bridge', 'http://192.168.1.70', 'devices', null, null),
  ];
}
