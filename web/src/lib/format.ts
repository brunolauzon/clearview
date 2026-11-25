export type Level = 'ok' | 'warn' | 'err';

/** k9s-style age: 41d6h, 3h12m, 7m, 42s */
export function fmtAge(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '-';
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function fmtBytes(n: number): string {
  const units = ['B', 'K', 'M', 'G', 'T', 'P'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)}${units[i]}`;
}

export function fmtKbps(kbps: number): string {
  if (kbps <= 0) return '0';
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${Math.round(kbps)} kbps`;
}

/** Epoch seconds or ISO string -> "3h", "2d" ago */
export function fmtAgo(when: number | string, nowMs = Date.now()): string {
  const ms = typeof when === 'number' ? when * 1000 : Date.parse(when);
  return fmtAge((nowMs - ms) / 1000);
}

export function levelOf(pct: number): Level {
  return pct >= 90 ? 'err' : pct >= 70 ? 'warn' : 'ok';
}

export function barParts(pct: number, width: number): { full: string; empty: string } {
  const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * width);
  return { full: '█'.repeat(filled), empty: '░'.repeat(width - filled) };
}

/**
 * Fill Unraid's `[IP]` token. Server-provided HOST_IP wins; otherwise use the address
 * the browser used to reach this dashboard, which is normally the same machine.
 */
export function resolveUrl(url: string | null, hostIp: string | null, fallbackHost?: string): string | null {
  if (!url) return null;
  const host = hostIp ?? fallbackHost ?? globalThis.location?.hostname ?? 'localhost';
  const safe = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return url.replace(/\[IP\]/gi, safe);
}

/** "http://192.168.1.10:8989/path" -> "192.168.1.10:8989" */
export function shortUrl(url: string | null): string {
  if (!url) return '-';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Drop the registry host and tag: "lscr.io/linuxserver/sonarr:latest" -> "linuxserver/sonarr" */
export function shortImage(image: string): string {
  const noTag = image.replace(/@sha256:.*$/, '').replace(/:[^/:]+$/, '');
  const parts = noTag.split('/');
  if (parts.length > 1 && (parts[0]!.includes('.') || parts[0]!.includes(':'))) parts.shift();
  return parts.join('/');
}
