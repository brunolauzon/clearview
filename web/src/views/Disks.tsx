import type { DiskInfo, HostStats, Snapshot } from '@clearview/shared';
import { Bar } from '../components/Bar';
import { Box, Note } from '../components/Box';
import { Table, type Column } from '../components/Table';
import { fmtBytes, levelOf } from '../lib/format';
import { Gate } from './Gate';

const cols: Column<DiskInfo>[] = [
  { id: 'name', title: 'name', width: '10ch', render: (d) => d.name },
  { id: 'mount', title: 'mount', width: 'minmax(12ch, 1.5fr)', min: 'md', render: (d) => <span className="c-dim">{d.mount}</span> },
  { id: 'usage', title: 'usage', width: '24ch', render: (d) => <Bar pct={d.usedPct} width={20} /> },
  { id: 'pct', title: 'used%', width: '7ch', align: 'right', render: (d) => <span className={`c-${levelOf(d.usedPct)}`}>{d.usedPct.toFixed(1)}%</span> },
  { id: 'used', title: 'used', width: '8ch', align: 'right', min: 'md', render: (d) => fmtBytes(d.usedBytes) },
  { id: 'free', title: 'free', width: '8ch', align: 'right', min: 'md', render: (d) => fmtBytes(d.freeBytes) },
  { id: 'size', title: 'size', width: '8ch', align: 'right', render: (d) => fmtBytes(d.totalBytes) },
];

interface DisksViewProps {
  snap: Snapshot<HostStats> | null;
  disks: DiskInfo[];
  filter: string;
  sel: number;
  onSelect: (i: number) => void;
}

export function DisksView({ snap, disks, filter, sel, onSelect }: DisksViewProps) {
  return (
    <Gate snap={snap} title="disks" setup="host stats unavailable">
      {() => (
        <Box title="disks" hint={filter ? `/${filter}` : 'all'} count={disks.length} className="grow">
          <Table cols={cols} rows={disks} rowKey={(d) => d.mount} sel={sel} onSelect={onSelect} empty={<Note>no disks found. Mount <code>/mnt</code> at <code>/host/mnt</code>.</Note>} />
        </Box>
      )}
    </Gate>
  );
}
