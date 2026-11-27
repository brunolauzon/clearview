import type { ContainerInfo } from '@clearview/shared';
import { Box, Empty, Loading, Note } from '../components/Box';
import { Table, type Column } from '../components/Table';
import { fmtAge, fmtBytes, fmtCpu, levelOf, resolveUrl, shortImage, shortUrl } from '../lib/format';
import { GLYPH } from '../lib/glyphs';
import { stateLevel, type SortKey, type StatsMap } from '../lib/rows';
import type { ListProps } from './types';

function portsText(c: ContainerInfo): string {
  const pub = c.ports.filter((p) => p.public !== null);
  if (pub.length === 0) return '-';
  const shown = pub.slice(0, 3).map((p) => (p.public === p.private ? `${p.private}` : `${p.public}→${p.private}`));
  return shown.join(',') + (pub.length > 3 ? ` +${pub.length - 3}` : '');
}

const none = <span className="c-dim">-</span>;

export function containerColumns(hostIp: string | null, stats: StatsMap | undefined): Column<ContainerInfo>[] {
  return [
    { id: 'name', title: 'name', width: 'minmax(10ch, 2fr)', sortable: true, render: (c) => c.name },
    {
      id: 'state',
      title: 'state',
      width: '12ch',
      narrow: '12ch',
      sortable: true,
      render: (c) => (
        <span className={`c-${stateLevel(c.state)}`}>
          {GLYPH.dot} {c.state}
        </span>
      ),
    },
    { id: 'age', title: 'age', width: '7ch', min: 'md', sortable: true, render: (c) => fmtAge(c.uptimeSec) },
    {
      id: 'cpu',
      title: 'cpu',
      width: '6ch',
      align: 'right',
      min: 'md',
      sortable: true,
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
      sortable: true,
      render: (c) => {
        const s = stats?.[c.id];
        if (!s) return none;
        // colored by share of the container's limit (or of host RAM when it has none)
        const level = levelOf(s.memPct);
        return <span className={level === 'ok' ? undefined : `c-${level}`}>{fmtBytes(s.memBytes)}</span>;
      },
    },
    { id: 'ports', title: 'ports', width: 'minmax(6ch, 1fr)', min: 'md', render: portsText },
    {
      id: 'web',
      title: 'webui',
      width: 'minmax(18ch, 1.6fr)',
      narrow: '5ch',
      render: (c) => {
        const url = resolveUrl(c.url, hostIp);
        if (!url) return none;
        return (
          <span className="c-accent">
            <span className="wide-only">
              {GLYPH.open} {shortUrl(url)}
            </span>
            <span className="narrow-only">open</span>
          </span>
        );
      },
    },
    { id: 'group', title: 'group', width: '15ch', min: 'lg', sortable: true, render: (c) => (c.group ? <span className="c-dim">{c.group}</span> : none) },
    { id: 'image', title: 'image', width: 'minmax(8ch, 1.8fr)', min: 'lg', render: (c) => <span className="c-dim">{shortImage(c.image)}</span> },
  ];
}

export interface ContainersTableProps extends ListProps {
  rows: ContainerInfo[];
  hostIp: string | null;
  sort: SortKey;
  onSort: (key: string) => void;
  onEdit: (name: string) => void;
  stats?: StatsMap;
}

export function ContainersTable({ rows, sel, onSelect, hostIp, sort, onSort, onEdit, stats, filter, onClearFilter }: ContainersTableProps) {
  // section headings only make sense when sorted by category, and only if any container has one
  const grouped = sort === 'group' && rows.some((r) => r.group);
  return (
    <Table
      label="containers"
      cols={containerColumns(hostIp, stats)}
      rows={rows}
      rowKey={(c) => c.id + c.name}
      sel={sel}
      onSelect={onSelect}
      href={(c) => resolveUrl(c.url, hostIp)}
      action={{ label: 'edit', describe: (c) => `edit settings for ${c.name}`, run: (c) => onEdit(c.rawName) }}
      sortId={sort}
      sortDesc={sort === 'cpu' || sort === 'mem'}
      onSort={onSort}
      groupOf={grouped ? (c) => c.group ?? 'other' : undefined}
      empty={
        filter ? (
          <Empty action="clear filter" onAction={onClearFilter}>
            no containers match “{filter}”
          </Empty>
        ) : (
          <Empty>no containers found. check that clearview can reach the Docker socket.</Empty>
        )
      }
    />
  );
}

interface ContainersViewProps extends ContainersTableProps {
  error: string | null;
  loading: boolean;
}

export function ContainersView({ error, loading, ...table }: ContainersViewProps) {
  return (
    <Box title="containers" hint={table.filter ? `/${table.filter}` : 'all'} count={table.rows.length} className="grow">
      {error && <Note tone="err">{error}</Note>}
      {loading ? <Loading what="containers" lines={8} /> : <ContainersTable {...table} />}
    </Box>
  );
}
