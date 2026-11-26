import type { ContainerInfo } from '@clearview/shared';
import { Box, Note } from '../components/Box';
import { Table, type Column } from '../components/Table';
import { fmtAge, fmtBytes, fmtCpu, levelOf, resolveUrl, shortImage, shortUrl } from '../lib/format';
import { stateLevel, type SortKey, type StatsMap } from '../lib/rows';

function portsText(c: ContainerInfo): string {
  const pub = c.ports.filter((p) => p.public !== null);
  if (pub.length === 0) return '-';
  const shown = pub.slice(0, 3).map((p) => (p.public === p.private ? `${p.private}` : `${p.public}→${p.private}`));
  return shown.join(',') + (pub.length > 3 ? ` +${pub.length - 3}` : '');
}

const none = <span className="c-faint">-</span>;

export function containerColumns(hostIp: string | null, stats: StatsMap | undefined): Column<ContainerInfo>[] {
  return [
    { id: 'name', title: 'name', width: 'minmax(14ch, 2fr)', render: (c) => c.name },
    {
      id: 'state',
      title: 'state',
      width: '12ch',
      render: (c) => <span className={`c-${stateLevel(c.state)}`}>● {c.state}</span>,
    },
    { id: 'age', title: 'age', width: '7ch', min: 'md', render: (c) => fmtAge(c.uptimeSec) },
    {
      id: 'cpu',
      title: 'cpu',
      width: '6ch',
      align: 'right',
      min: 'md',
      render: (c) => {
        const cpu = stats?.[c.id]?.cpuPct;
        if (cpu === null || cpu === undefined) return none;
        // dim when idle, amber once it is using more than a whole core
        return <span className={cpu < 1 ? 'c-dim' : cpu >= 100 ? 'c-warn' : undefined}>{fmtCpu(cpu)}</span>;
      },
    },
    {
      id: 'mem',
      title: 'mem',
      width: '6ch',
      align: 'right',
      min: 'md',
      render: (c) => {
        const s = stats?.[c.id];
        if (!s) return none;
        // colored by share of the container's limit (or of host RAM when it has none)
        const level = levelOf(s.memPct);
        return <span className={level === 'ok' ? undefined : `c-${level}`}>{fmtBytes(s.memBytes)}</span>;
      },
    },
    { id: 'ports', title: 'ports', width: 'minmax(8ch, 1fr)', min: 'md', render: portsText },
    {
      id: 'web',
      title: 'webui',
      width: 'minmax(8ch, 1.4fr)',
      render: (c) => {
        const url = resolveUrl(c.url, hostIp);
        return url ? <span className="c-accent">↗ {shortUrl(url)}</span> : none;
      },
    },
    { id: 'group', title: 'group', width: '15ch', min: 'lg', render: (c) => (c.group ? <span className="c-dim">{c.group}</span> : none) },
    { id: 'image', title: 'image', width: 'minmax(12ch, 2fr)', min: 'lg', render: (c) => <span className="c-dim">{shortImage(c.image)}</span> },
  ];
}

interface ContainersTableProps {
  rows: ContainerInfo[];
  sel: number;
  onSelect: (i: number) => void;
  hostIp: string | null;
  sort: SortKey;
  stats?: StatsMap;
}

export function ContainersTable({ rows, sel, onSelect, hostIp, sort, stats }: ContainersTableProps) {
  // section headings only make sense when sorted by category, and only if any container has one
  const grouped = sort === 'group' && rows.some((r) => r.group);
  return (
    <Table
      cols={containerColumns(hostIp, stats)}
      rows={rows}
      rowKey={(c) => c.id + c.name}
      sel={sel}
      onSelect={onSelect}
      href={(c) => resolveUrl(c.url, hostIp)}
      sortId={sort}
      sortDesc={sort === 'cpu' || sort === 'mem'}
      groupOf={grouped ? (c) => c.group ?? 'other' : undefined}
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
