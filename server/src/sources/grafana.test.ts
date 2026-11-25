import { describe, expect, it } from 'vitest';
import { mapAlerts, rewriteOrigin, severityOf, type RawAlert } from './grafana';

const alert = (over: Partial<RawAlert> & { name?: string; severity?: string } = {}): RawAlert => ({
  fingerprint: over.fingerprint ?? 'fp',
  startsAt: over.startsAt ?? '2026-01-01T00:00:00Z',
  generatorURL: over.generatorURL,
  status: over.status ?? { state: 'active' },
  labels: { alertname: over.name ?? 'HighCPU', ...(over.severity ? { severity: over.severity } : {}) },
  annotations: over.annotations,
});

describe('severityOf', () => {
  it('normalises common label values', () => {
    expect(severityOf('Critical')).toBe('critical');
    expect(severityOf('warn')).toBe('warning');
    expect(severityOf('info')).toBe('info');
    expect(severityOf(undefined)).toBe('unknown');
    expect(severityOf('banana')).toBe('unknown');
  });
});

describe('rewriteOrigin', () => {
  it('swaps the origin but keeps path, query and hash', () => {
    expect(rewriteOrigin('http://grafana:3000/alerting/x/view?orgId=1#top', 'http://192.168.1.10:3000')).toBe(
      'http://192.168.1.10:3000/alerting/x/view?orgId=1#top',
    );
  });
  it('is a no-op without a public URL', () => {
    expect(rewriteOrigin('http://grafana:3000/a', null)).toBe('http://grafana:3000/a');
  });
});

describe('mapAlerts', () => {
  it('sorts critical first, then oldest first', () => {
    const out = mapAlerts(
      [
        alert({ fingerprint: 'w-new', name: 'W new', severity: 'warning', startsAt: '2026-01-02T00:00:00Z' }),
        alert({ fingerprint: 'c', name: 'C', severity: 'critical', startsAt: '2026-01-03T00:00:00Z' }),
        alert({ fingerprint: 'w-old', name: 'W old', severity: 'warning', startsAt: '2026-01-01T00:00:00Z' }),
        alert({ fingerprint: 'i', name: 'I', severity: 'info' }),
      ],
      'http://g:3000',
      null,
    );
    expect(out.map((a) => a.id)).toEqual(['c', 'w-old', 'w-new', 'i']);
  });

  it('drops suppressed alerts and falls back to description and the alert list URL', () => {
    const out = mapAlerts(
      [
        alert({ fingerprint: 'sil', status: { state: 'suppressed' } }),
        alert({ fingerprint: 'ok', annotations: { description: 'details' } }),
      ],
      'http://g:3000',
      'http://pub:3000',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'ok', summary: 'details', url: 'http://pub:3000/alerting/list' });
  });
});
