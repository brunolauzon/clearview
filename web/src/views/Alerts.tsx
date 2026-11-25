import type { AlertInfo, AlertSeverity, Snapshot } from '@clearview/shared';
import { Box, Note } from '../components/Box';
import { Table, type Column } from '../components/Table';
import { fmtAgo, resolveUrl } from '../lib/format';
import { Gate } from './Gate';

export const SEVERITY_TONE: Record<AlertSeverity, string> = { critical: 'err', warning: 'warn', info: 'info', unknown: 'dim' };
export const SEVERITY_LABEL: Record<AlertSeverity, string> = { critical: 'CRIT', warning: 'WARN', info: 'INFO', unknown: '????' };

interface AlertsViewProps {
  snap: Snapshot<AlertInfo[]> | null;
  alerts: AlertInfo[];
  filter: string;
  sel: number;
  onSelect: (i: number) => void;
  hostIp: string | null;
  now: number;
}

export function AlertsView({ snap, alerts, filter, sel, onSelect, hostIp, now }: AlertsViewProps) {
  const cols: Column<AlertInfo>[] = [
    { id: 'sev', title: 'sev', width: '8ch', render: (a) => <span className={`c-${SEVERITY_TONE[a.severity]}`}>● {SEVERITY_LABEL[a.severity]}</span> },
    { id: 'name', title: 'alert', width: 'minmax(16ch, 2fr)', render: (a) => a.name },
    { id: 'since', title: 'firing', width: '7ch', render: (a) => fmtAgo(a.startsAt, now) },
    { id: 'summary', title: 'summary', width: 'minmax(16ch, 3fr)', min: 'md', render: (a) => <span className="c-dim">{a.summary ?? '-'}</span> },
  ];
  return (
    <Gate
      snap={snap}
      title="alerts"
      setup={
        <>
          grafana not configured. Set <code>GRAFANA_URL</code> and <code>GRAFANA_TOKEN</code> (Grafana → Administration → Service accounts → Viewer role → add token).
        </>
      }
    >
      {() => (
        <Box title="alerts" hint={filter ? `/${filter}` : 'firing'} count={alerts.length} className="grow">
          <Table
            cols={cols}
            rows={alerts}
            rowKey={(a) => a.id}
            sel={sel}
            onSelect={onSelect}
            href={(a) => resolveUrl(a.url, hostIp)}
            empty={<Note tone="ok">✓ nothing firing</Note>}
          />
        </Box>
      )}
    </Gate>
  );
}
