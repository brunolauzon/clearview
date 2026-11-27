import type { LinkInfo, Snapshot } from '@clearview/shared';
import { Box, Empty } from '../components/Box';
import { Table, type Column } from '../components/Table';
import { shortUrl } from '../lib/format';
import { GLYPH } from '../lib/glyphs';
import { Gate } from './Gate';
import type { ListProps } from './types';

const none = <span className="c-dim">-</span>;

const cols: Column<LinkInfo>[] = [
  { id: 'name', title: 'name', width: 'minmax(12ch, 2fr)', render: (l) => l.name },
  { id: 'group', title: 'group', width: '12ch', min: 'md', render: (l) => <span className="c-dim">{l.group}</span> },
  {
    id: 'url',
    title: 'address',
    width: 'minmax(14ch, 2fr)',
    render: (l) => (
      <span className="c-accent">
        {GLYPH.open} {shortUrl(l.url)}
      </span>
    ),
  },
  {
    id: 'status',
    title: 'status',
    width: '7ch',
    render: (l) =>
      l.up === null ? (
        <span className="c-dim" title="not checked">
          -
        </span>
      ) : (
        <span className={l.up ? 'c-ok' : 'c-err'}>
          {GLYPH.dot} {l.up ? 'up' : 'down'}
        </span>
      ),
  },
  { id: 'latency', title: 'ping', width: '7ch', align: 'right', min: 'md', render: (l) => (l.latencyMs === null ? none : `${l.latencyMs}ms`) },
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

interface LinksViewProps extends ListProps {
  snap: Snapshot<LinkInfo[]> | null;
  links: LinkInfo[];
  onAdd: () => void;
}

export function LinksView({ snap, links, filter, sel, onSelect, onClearFilter, onAdd }: LinksViewProps) {
  return (
    <Gate
      snap={snap}
      title="links"
      setup={
        <>
          <p>no links yet. add the other devices on your network (router, NAS, printer) to open them from here and see which are up.</p>
          <button type="button" className="btn primary" onClick={onAdd}>
            add a link
          </button>
          <details>
            <summary>or write them in the config file</summary>
            <pre className="code">{EXAMPLE}</pre>
          </details>
        </>
      }
    >
      {() => (
        <Box title="links" hint={filter ? `/${filter}` : 'all'} count={links.length} className="grow">
          <Table
            label="links"
            cols={cols}
            rows={links}
            rowKey={(l) => l.url + l.name}
            sel={sel}
            onSelect={onSelect}
            href={(l) => l.url}
            empty={
              <Empty action="clear filter" onAction={onClearFilter}>
                no links match “{filter}”
              </Empty>
            }
          />
        </Box>
      )}
    </Gate>
  );
}
