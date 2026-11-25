import type { ContainerInfo } from '@clearview/shared';
import { Box, Note } from '../components/Box';
import { Table, type Column } from '../components/Table';
import { fmtAge, resolveUrl, shortImage, shortUrl } from '../lib/format';
import { stateLevel, type SortKey } from '../lib/rows';

function portsText(c: ContainerInfo): string {
  const pub = c.ports.filter((p) => p.public !== null);
  if (pub.length === 0) return '-';
  const shown = pub.slice(0, 3).map((p) => (p.public === p.private ? `${p.private}` : `${p.public}→${p.private}`));
  return shown.join(',') + (pub.length > 3 ? ` +${pub.length - 3}` : '');
}

export function containerColumns(hostIp: string | null): Column<ContainerInfo>[] {
  return [
    { id: 'name', title: 'name', width: 'minmax(14ch, 2fr)', render: (c) => c.name },
    {
      id: 'state',
      title: 'state',
      width: '12ch',
      render: (c) => <span className={`c-${stateLevel(c.state)}`}>● {c.state}</span>,
    },
    { id: 'age', title: 'age', width: '7ch', min: 'md', render: (c) => fmtAge(c.uptimeSec) },
    { id: 'ports', title: 'ports', width: 'minmax(8ch, 1fr)', min: 'md', render: portsText },
    {
      id: 'web',
      title: 'webui',
      width: 'minmax(8ch, 1.4fr)',
      render: (c) => {
        const url = resolveUrl(c.url, hostIp);
        return url ? <span className="c-accent">↗ {shortUrl(url)}</span> : <span className="c-faint">-</span>;
      },
    },
    { id: 'image', title: 'image', width: 'minmax(12ch, 2fr)', min: 'lg', render: (c) => <span className="c-dim">{shortImage(c.image)}</span> },
  ];
}

interface ContainersTableProps {
  rows: ContainerInfo[];
  sel: number;
  onSelect: (i: number) => void;
  hostIp: string | null;
  sort: SortKey;
}

export function ContainersTable({ rows, sel, onSelect, hostIp, sort }: ContainersTableProps) {
  return (
    <Table
      cols={containerColumns(hostIp)}
      rows={rows}
      rowKey={(c) => c.id + c.name}
      sel={sel}
      onSelect={onSelect}
      href={(c) => resolveUrl(c.url, hostIp)}
      sortId={sort === 'state' ? 'state' : sort === 'age' ? 'age' : 'name'}
      empty={<Note>no containers match</Note>}
    />
  );
}

interface ContainersViewProps extends ContainersTableProps {
  filter: string;
  error: string | null;
  loading: boolean;
}

export function ContainersView({ filter, error, loading, ...table }: ContainersViewProps) {
  return (
    <Box title="containers" hint={filter ? `/${filter}` : 'all'} count={table.rows.length} className="grow">
      {error && <Note tone="err">⚠ {error}</Note>}
      {loading ? <Note>connecting…</Note> : <ContainersTable {...table} />}
    </Box>
  );
}
