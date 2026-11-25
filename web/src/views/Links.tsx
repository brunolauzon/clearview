import type { LinkInfo, Snapshot } from '@clearview/shared';
import { Box, Note } from '../components/Box';
import { Table, type Column } from '../components/Table';
import { shortUrl } from '../lib/format';
import { Gate } from './Gate';

const cols: Column<LinkInfo>[] = [
  { id: 'name', title: 'name', width: 'minmax(14ch, 2fr)', render: (l) => l.name },
  { id: 'group', title: 'group', width: '12ch', min: 'md', render: (l) => <span className="c-dim">{l.group}</span> },
  { id: 'url', title: 'address', width: 'minmax(16ch, 2fr)', render: (l) => <span className="c-accent">↗ {shortUrl(l.url)}</span> },
  {
    id: 'status',
    title: 'status',
    width: '9ch',
    render: (l) =>
      l.up === null ? <span className="c-faint">-</span> : l.up ? <span className="c-ok">● up</span> : <span className="c-err">● down</span>,
  },
  { id: 'latency', title: 'ping', width: '7ch', align: 'right', min: 'md', render: (l) => (l.latencyMs === null ? <span className="c-faint">-</span> : `${l.latencyMs}ms`) },
  { id: 'note', title: 'note', width: 'minmax(10ch, 2fr)', min: 'lg', render: (l) => <span className="c-dim">{l.description ?? ''}</span> },
];

const EXAMPLE = `links:
  - name: Router
    url: http://192.168.1.1
    group: network
  - name: Proxmox
    url: https://192.168.1.20:8006
    group: compute
    check: tcp        # http (default) | tcp | none`;

interface LinksViewProps {
  snap: Snapshot<LinkInfo[]> | null;
  links: LinkInfo[];
  filter: string;
  sel: number;
  onSelect: (i: number) => void;
}

export function LinksView({ snap, links, filter, sel, onSelect }: LinksViewProps) {
  return (
    <Gate
      snap={snap}
      title="links"
      setup={
        <>
          no links yet. Add them to <code>/config/clearview.yaml</code>:
          <pre className="code">{EXAMPLE}</pre>
        </>
      }
    >
      {() => (
        <Box title="links" hint={filter ? `/${filter}` : 'all'} count={links.length} className="grow">
          <Table cols={cols} rows={links} rowKey={(l) => l.url} sel={sel} onSelect={onSelect} href={(l) => l.url} empty={<Note>no links match</Note>} />
        </Box>
      )}
    </Gate>
  );
}
