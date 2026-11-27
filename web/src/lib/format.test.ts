import { describe, expect, it } from 'vitest';
import {
  fmtAge,
  fmtAgo,
  fmtBitrate,
  fmtBytes,
  fmtCpu,
  fmtKbps,
  fmtPrice,
  fmtSigned,
  levelOf,
  priceDigits,
  resolveUrl,
  shortImage,
  shortUrl,
  weatherKind,
} from './format';

describe('prices', () => {
  it('separates thousands and shows more decimals under 1', () => {
    expect(fmtPrice(7182.78)).toBe('7,182.78');
    expect(fmtPrice(355.5)).toBe('355.50');
    expect(fmtPrice(0.12345)).toBe('0.1235');
    expect(priceDigits(0.5)).toBe(4);
    expect(priceDigits(12)).toBe(2);
  });
  it('signs gains and losses, and drops the sign when it rounds to zero', () => {
    expect(fmtSigned(1.509999)).toBe('+1.51');
    expect(fmtSigned(-18.3100004)).toBe('-18.31');
    expect(fmtSigned(-0.0001)).toBe('0.00');
    expect(fmtSigned(1234.5)).toBe('+1,234.50');
    expect(fmtSigned(0.00234, 4)).toBe('+0.0023');
  });
});

describe('fmtBitrate', () => {
  it('scales bits per second and marks unknowns', () => {
    expect([512, 45_000, 84_000_000, 1_250_000_000].map(fmtBitrate)).toEqual(['512 bps', '45 kbps', '84.0 Mbps', '1.3 Gbps']);
    expect(fmtBitrate(0)).toBe('0 bps');
    expect(fmtBitrate(null)).toBe('-');
  });
});

describe('weatherKind', () => {
  it('picks a picture for each group of weather codes, with night versions when the sky shows', () => {
    expect([0, 1, 2, 3].map((c) => weatherKind(c, true))).toEqual(['clear-day', 'clear-day', 'partly-day', 'cloudy']);
    expect([0, 2, 3].map((c) => weatherKind(c, false))).toEqual(['clear-night', 'partly-night', 'cloudy']);
    expect([45, 48, 51, 57].map((c) => weatherKind(c, true))).toEqual(['fog', 'fog', 'drizzle', 'drizzle']);
    expect([61, 67, 80, 82].map((c) => weatherKind(c, true))).toEqual(['rain', 'rain', 'rain', 'rain']);
    expect([71, 77, 85, 86].map((c) => weatherKind(c, true))).toEqual(['snow', 'snow', 'snow', 'snow']);
    expect([95, 96, 99].map((c) => weatherKind(c, true))).toEqual(['storm', 'storm', 'storm']);
    expect([4, 68, 100, -1].map((c) => weatherKind(c, true))).toEqual(['unknown', 'unknown', 'unknown', 'unknown']);
  });
});

describe('fmtCpu', () => {
  it('shows one decimal under 10%, whole numbers above, a dash when unknown', () => {
    expect(fmtCpu(0)).toBe('0.0%');
    expect(fmtCpu(3.456)).toBe('3.5%');
    expect(fmtCpu(12.4)).toBe('12%');
    expect(fmtCpu(250.7)).toBe('251%');
    expect(fmtCpu(null)).toBe('-');
    expect(fmtCpu(undefined)).toBe('-');
  });
});

describe('fmtAge', () => {
  it('uses the two largest units', () => {
    expect(fmtAge(45)).toBe('45s');
    expect(fmtAge(7 * 60 + 5)).toBe('7m');
    expect(fmtAge(3 * 3600 + 12 * 60)).toBe('3h12m');
    expect(fmtAge(41 * 86400 + 6 * 3600)).toBe('41d6h');
    expect(fmtAge(null)).toBe('-');
  });
});

describe('fmtAgo', () => {
  it('accepts epoch seconds and ISO strings', () => {
    const now = Date.parse('2026-01-01T12:00:00Z');
    expect(fmtAgo(now / 1000 - 3600, now)).toBe('1h0m');
    expect(fmtAgo('2026-01-01T09:00:00Z', now)).toBe('3h0m');
  });
});

describe('fmtBytes', () => {
  it('scales and rounds', () => {
    expect(fmtBytes(512)).toBe('512B');
    expect(fmtBytes(1.8 * 1024 ** 4)).toBe('1.8T');
    expect(fmtBytes(12 * 1024 ** 4)).toBe('12T');
    expect(fmtBytes(340 * 1024 ** 2)).toBe('340M');
  });
});

describe('fmtKbps', () => {
  it('switches to Mbps at 1000', () => {
    expect(fmtKbps(0)).toBe('0');
    expect(fmtKbps(640)).toBe('640 kbps');
    expect(fmtKbps(8200)).toBe('8.2 Mbps');
  });
});

describe('levelOf', () => {
  it('flags usage thresholds', () => {
    expect(levelOf(10)).toBe('ok');
    expect(levelOf(70)).toBe('warn');
    expect(levelOf(95)).toBe('err');
  });
});

describe('resolveUrl', () => {
  it('prefers HOST_IP, then the browser host', () => {
    expect(resolveUrl('http://[IP]:8989/', '192.168.1.10', 'tower.local')).toBe('http://192.168.1.10:8989/');
    expect(resolveUrl('http://[IP]:8989/', null, 'tower.local')).toBe('http://tower.local:8989/');
  });
  it('brackets IPv6 hosts and passes through URLs without the token', () => {
    expect(resolveUrl('http://[IP]:1/', null, 'fe80::1')).toBe('http://[fe80::1]:1/');
    expect(resolveUrl('https://example.com', null, 'x')).toBe('https://example.com');
    expect(resolveUrl(null, null, 'x')).toBeNull();
  });
});

describe('shortUrl and shortImage', () => {
  it('trims for table display', () => {
    expect(shortUrl('http://192.168.1.10:8989/path')).toBe('192.168.1.10:8989');
    expect(shortUrl(null)).toBe('-');
    expect(shortImage('lscr.io/linuxserver/sonarr:latest')).toBe('linuxserver/sonarr');
    expect(shortImage('grafana/grafana')).toBe('grafana/grafana');
    expect(shortImage('redis:7-alpine')).toBe('redis');
    expect(shortImage('localhost:5000/app:1')).toBe('app');
  });
});
