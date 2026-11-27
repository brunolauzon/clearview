import type { PlexData, PlexStream, Snapshot } from '@clearview/shared';
import { Bar } from '../components/Bar';
import { Box, Note } from '../components/Box';
import { Table, type Column } from '../components/Table';
import { fmtAgo, fmtKbps } from '../lib/format';
import { Gate } from './Gate';

const STATE_GLYPH: Record<PlexStream['state'], string> = {
  playing: '▶ playing',
  paused: '❚❚ paused',
  buffering: '… buffering',
  unknown: '? unknown',
};

const DECISION_TONE: Record<PlexStream['decision'], string> = {
  'direct play': 'ok',
  'direct stream': 'info',
  transcode: 'warn',
  unknown: 'dim',
};

export const streamColumns: Column<PlexStream>[] = [
  { id: 'user', title: 'user', width: 'minmax(8ch, 1fr)', render: (s) => s.user },
  { id: 'title', title: 'title', width: 'minmax(16ch, 3fr)', render: (s) => s.title },
  {
    id: 'state',
    title: 'state',
    width: '12ch',
    render: (s) => <span className={s.state === 'playing' ? 'c-ok' : 'c-warn'}>{STATE_GLYPH[s.state]}</span>,
  },
  { id: 'decision', title: 'stream', width: '14ch', min: 'md', render: (s) => <span className={`c-${DECISION_TONE[s.decision]}`}>{s.decision}</span> },
  { id: 'player', title: 'player', width: 'minmax(10ch, 1.2fr)', min: 'lg', render: (s) => <span className="c-dim">{s.player}</span> },
  { id: 'quality', title: 'quality', width: 'minmax(10ch, 1.2fr)', min: 'lg', render: (s) => <span className="c-dim">{s.quality ?? '-'}</span> },
  { id: 'net', title: 'net', width: '5ch', min: 'md', render: (s) => <span className={s.location === 'wan' ? 'c-warn' : 'c-dim'}>{s.location}</span> },
  { id: 'bw', title: 'bw', width: '10ch', align: 'right', min: 'md', render: (s) => fmtKbps(s.bandwidthKbps) },
  { id: 'progress', title: 'progress', width: '16ch', render: (s) => (
    <>
      <Bar pct={s.progressPct} width={10} level="info" /> <span className="c-dim">{Math.round(s.progressPct)}%</span>
    </>
  ) },
];

export function PlexSummary({ data }: { data: PlexData }) {
  if (data.streamCount === 0) return <div className="summary c-dim">▷ no active streams</div>;
  return (
    <div className="summary">
      <span className="c-accent">▶ {data.streamCount} stream{data.streamCount === 1 ? '' : 's'}</span>
      <span className="c-dim"> · </span>
      <span className={data.transcodeCount > 0 ? 'c-warn' : 'c-dim'}>{data.transcodeCount} transcoding</span>
      <span className="c-dim"> · </span>
      {fmtKbps(data.totalBandwidthKbps)}
      <span className="c-dim"> (lan {fmtKbps(data.lanBandwidthKbps)} / wan {fmtKbps(data.wanBandwidthKbps)})</span>
    </div>
  );
}

interface PlexViewProps {
  snap: Snapshot<PlexData> | null;
  streams: PlexStream[];
  filter: string;
  sel: number;
  onSelect: (i: number) => void;
  now: number;
  tautulliUrl: string | null;
}

export function PlexView({ snap, streams, filter, sel, onSelect, now }: PlexViewProps) {
  return (
    <Gate
      snap={snap}
      title="plex"
      setup={
        <>
          tautulli not configured. Set <code>TAUTULLI_URL</code> and <code>TAUTULLI_API_KEY</code> (Tautulli → Settings → Web Interface → API key).
        </>
      }
    >
      {(data) => (
        <div className="stack">
          <Box title="streams" hint={filter ? `/${filter}` : 'live'} count={streams.length}>
            <PlexSummary data={data} />
            <Table
              cols={streamColumns}
              rows={streams}
              rowKey={(s) => s.id}
              sel={sel}
              onSelect={onSelect}
              empty={<Note>nothing playing</Note>}
            />
          </Box>
          <Box title="recently added" count={data.recent.length}>
            <Table
              cols={[
                { id: 'when', title: 'ago', width: '6ch', render: (r) => <span className="c-dim">{fmtAgo(r.addedAt, now)}</span> },
                { id: 'title', title: 'title', width: 'minmax(16ch, 3fr)', render: (r) => r.title },
                { id: 'library', title: 'library', width: 'minmax(10ch, 1fr)', min: 'md', render: (r) => <span className="c-dim">{r.library}</span> },
              ]}
              rows={data.recent}
              rowKey={(r) => r.id}
              empty={<Note>nothing new</Note>}
            />
          </Box>
          <div className="cols3">
            <Box title="libraries" count={data.libraries.length}>
              <Table
                cols={[
                  { id: 'name', title: 'name', width: '1fr', render: (l) => l.name },
                  { id: 'count', title: 'items', width: '8ch', align: 'right', render: (l) => l.count.toLocaleString() },
                  { id: 'child', title: 'children', width: '9ch', align: 'right', render: (l) => (l.childCount ? l.childCount.toLocaleString() : <span className="c-faint">-</span>) },
                ]}
                rows={data.libraries}
                rowKey={(l) => l.name}
              />
            </Box>
            <Box title="recently watched" count={data.history.length}>
              <Table
                cols={[
                  { id: 'when', title: 'ago', width: '6ch', render: (h) => <span className="c-dim">{fmtAgo(h.stoppedAt, now)}</span> },
                  { id: 'user', title: 'user', width: '9ch', render: (h) => h.user },
                  { id: 'title', title: 'title', width: '1fr', render: (h) => h.title },
                ]}
                rows={data.history}
                rowKey={(h) => `${h.stoppedAt}${h.user}${h.title}`}
                empty={<Note>no history</Note>}
              />
            </Box>
            <Box title="top" hint="30d">
              {data.top.length === 0 && <Note>no stats</Note>}
              {data.top.map((stat) => (
                <div key={stat.id} className="top-block">
                  <div className="c-accent top-title">{stat.title}</div>
                  {stat.rows.map((r) => (
                    <div key={r.label} className="top-row">
                      <span className="top-label">{r.label}</span>
                      <span className="c-dim">{r.plays}</span>
                    </div>
                  ))}
                </div>
              ))}
            </Box>
          </div>
        </div>
      )}
    </Gate>
  );
}
