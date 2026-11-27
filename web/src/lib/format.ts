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

/** CPU like `docker stats`: one decimal under 10%, whole numbers above, "-" when not measured yet. */
export function fmtCpu(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return '-';
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

/** Two decimals, four for prices under 1 (small currencies and coins). */
export function priceDigits(price: number): number {
  return Math.abs(price) < 1 ? 4 : 2;
}

/** 7182.78 -> "7,182.78" */
export function fmtPrice(price: number): string {
  const digits = priceDigits(price);
  return price.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** A gain or loss with its sign: "+1.51", "-18.31", and plain "0.00" when it rounds to nothing. */
export function fmtSigned(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  const body = Math.abs(rounded).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${rounded > 0 ? '+' : rounded < 0 ? '-' : ''}${body}`;
}

export type WeatherKind =
  | 'clear-day'
  | 'clear-night'
  | 'partly-day'
  | 'partly-night'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm'
  | 'unknown';

/** Which picture fits a WMO weather code. */
export function weatherKind(code: number, isDay: boolean): WeatherKind {
  if (code === 0 || code === 1) return isDay ? 'clear-day' : 'clear-night';
  if (code === 2) return isDay ? 'partly-day' : 'partly-night';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'unknown';
}

/** Network throughput from bits per second: "84.0 Mbps", "1.2 Gbps"; "-" when unknown. */
export function fmtBitrate(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return '-';
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(1)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  if (bps >= 1e3) return `${Math.round(bps / 1e3)} kbps`;
  return `${Math.round(bps)} bps`;
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
