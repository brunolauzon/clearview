import type { AlertInfo, AlertSeverity, Snapshot } from '@clearview/shared';
import { Box, Empty } from '../components/Box';
import { Table, type Column } from '../components/Table';
import { fmtAgo, resolveUrl } from '../lib/format';
import { GLYPH } from '../lib/glyphs';
import { Gate } from './Gate';
import type { ListProps } from './types';

export const SEVERITY_TONE: Record<AlertSeverity, string> = { critical: 'err', warning: 'warn', info: 'info', unknown: 'dim' };
export const SEVERITY_LABEL: Record<AlertSeverity, string> = { critical: 'CRIT', warning: 'WARN', info: 'INFO', unknown: '????' };

interface AlertsViewProps extends ListProps {
  snap: Snapshot<AlertInfo[]> | null;
  alerts: AlertInfo[];
  hostIp: string | null;
  now: number;
}

export function AlertsView({ snap, alerts, filter, sel, onSelect, onClearFilter, hostIp, now }: AlertsViewProps) {
  const cols: Column<AlertInfo>[] = [
    {
      id: 'sev',
      title: 'sev',
      width: '7ch',
      render: (a) => (
        <span className={`c-${SEVERITY_TONE[a.severity]}`} title={a.severity}>
          {GLYPH.dot} {SEVERITY_LABEL[a.severity]}
        </span>
      ),
    },
    { id: 'name', title: 'alert', width: 'minmax(16ch, 2fr)', primary: true, wrap: true, render: (a) => a.name },
    { id: 'since', title: 'firing', width: '7ch', render: (a) => fmtAgo(a.startsAt, now) },
    { id: 'summary', title: 'summary', width: 'minmax(16ch, 3fr)', min: 'md', wrap: true, render: (a) => <span className="c-dim">{a.summary ?? '-'}</span> },
  ];
  return (
    <Gate
      snap={snap}
      title="alerts"
      setup={
        <>
          grafana not configured. set <code>GRAFANA_URL</code> and <code>GRAFANA_TOKEN</code> (Grafana → Administration → Service accounts → Viewer role → add token).
        </>
      }
    >
      {() => (
        <Box title="alerts" hint={filter ? `/${filter}` : 'firing'} count={alerts.length} className="grow">
          <Table
            label="firing alerts"
            cols={cols}
            rows={alerts}
            rowKey={(a) => a.id}
            sel={sel}
            onSelect={onSelect}
            href={(a) => resolveUrl(a.url, hostIp)}
            empty={
              filter ? (
                <Empty action="clear filter" onAction={onClearFilter}>
                  no alerts match “{filter}”
                </Empty>
              ) : (
                <Empty tone="ok">{GLYPH.check} nothing firing</Empty>
              )
            }
          />
        </Box>
      )}
    </Gate>
  );
}
