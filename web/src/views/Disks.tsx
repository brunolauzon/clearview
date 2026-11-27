import type { DiskInfo, HostStats, Snapshot } from '@clearview/shared';
import { Bar } from '../components/Bar';
import { Box, Empty } from '../components/Box';
import { Table, type Column } from '../components/Table';
import { fmtBytes, levelOf } from '../lib/format';
import { Gate } from './Gate';
import type { ListProps } from './types';

const cols: Column<DiskInfo>[] = [
  { id: 'name', title: 'name', width: 'minmax(7ch, 10ch)', render: (d) => d.name },
  { id: 'mount', title: 'mount', width: 'minmax(12ch, 1.5fr)', min: 'lg', render: (d) => <span className="c-dim">{d.mount}</span> },
  { id: 'usage', title: 'usage', width: '21ch', min: 'md', render: (d) => <Bar pct={d.usedPct} width={20} label={`${d.name} usage`} /> },
  { id: 'pct', title: 'used%', width: '7ch', align: 'right', render: (d) => <span className={`c-${levelOf(d.usedPct)}`}>{d.usedPct.toFixed(1)}%</span> },
  { id: 'used', title: 'used', width: '8ch', align: 'right', min: 'md', render: (d) => fmtBytes(d.usedBytes) },
  { id: 'free', title: 'free', width: '8ch', align: 'right', render: (d) => fmtBytes(d.freeBytes) },
  { id: 'size', title: 'size', width: '8ch', align: 'right', render: (d) => fmtBytes(d.totalBytes) },
];

interface DisksViewProps extends ListProps {
  snap: Snapshot<HostStats> | null;
  disks: DiskInfo[];
}

export function DisksView({ snap, disks, filter, sel, onSelect, onClearFilter }: DisksViewProps) {
  return (
    <Gate snap={snap} title="disks" setup="host stats are unavailable">
      {() => (
        <Box title="disks" hint={filter ? `/${filter}` : 'all'} count={disks.length} className="grow">
          <Table
            label="disks"
            cols={cols}
            rows={disks}
            rowKey={(d) => d.mount}
            sel={sel}
            onSelect={onSelect}
            empty={
              filter ? (
                <Empty action="clear filter" onAction={onClearFilter}>
                  no disks match “{filter}”
                </Empty>
              ) : (
                <Empty>
                  no disks found. mount <code>/mnt</code> at <code>/host/mnt</code>.
                </Empty>
              )
            }
          />
        </Box>
      )}
    </Gate>
  );
}
