import type { AlertInfo, AlertSeverity } from '@clearview/shared';
import type { AppConfig } from '../config';
import { fetchJson } from '../http';

export interface RawAlert {
  fingerprint?: string;
  startsAt: string;
  generatorURL?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  status?: { state?: string };
}

export function severityOf(label: string | undefined): AlertSeverity {
  switch ((label ?? '').toLowerCase()) {
    case 'critical':
    case 'crit':
    case 'error':
    case 'page':
    case 'high':
      return 'critical';
    case 'warning':
    case 'warn':
    case 'medium':
      return 'warning';
    case 'info':
    case 'notice':
    case 'low':
      return 'info';
    default:
      return 'unknown';
  }
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, unknown: 2, info: 3 };

/** Re-point a Grafana link at the address the browser can reach (Grafana often knows itself by an internal name). */
export function rewriteOrigin(link: string, publicUrl: string | null): string {
  if (!publicUrl) return link;
  try {
    const from = new URL(link);
    const to = new URL(publicUrl);
    return `${to.origin}${from.pathname}${from.search}${from.hash}`;
  } catch {
    return link;
  }
}

export function mapAlerts(raw: RawAlert[], baseUrl: string, publicUrl: string | null): AlertInfo[] {
  return raw
    .filter((a) => (a.status?.state ?? 'active') === 'active')
    .map((a) => {
      const labels = a.labels ?? {};
      const name = labels.alertname ?? 'alert';
      return {
        id: a.fingerprint ?? `${name}@${a.startsAt}`,
        name,
        severity: severityOf(labels.severity),
        startsAt: a.startsAt,
        summary: a.annotations?.summary ?? a.annotations?.description ?? null,
        url: a.generatorURL ? rewriteOrigin(a.generatorURL, publicUrl) : `${publicUrl ?? baseUrl}/alerting/list`,
        labels,
      };
    })
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || Date.parse(a.startsAt) - Date.parse(b.startsAt),
    );
}

export async function fetchAlerts(cfg: NonNullable<AppConfig['grafana']>): Promise<AlertInfo[]> {
  const raw = await fetchJson<RawAlert[]>(
    'grafana',
    `${cfg.url}/api/alertmanager/grafana/api/v2/alerts?active=true&silenced=false&inhibited=false`,
    { headers: { Accept: 'application/json', ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}) } },
  );
  return mapAlerts(raw, cfg.url, cfg.publicUrl);
}
