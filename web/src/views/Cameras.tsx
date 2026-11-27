import type { ProtectCamera, ProtectData, ProtectEvent, Snapshot } from '@clearview/shared';
import { Box, Note } from '../components/Box';
import { Table, type Column } from '../components/Table';
import { fmtAge, fmtAgo } from '../lib/format';
import { headlineEvent } from '../lib/panels';
import { Gate } from './Gate';

const STATE_TONE: Record<ProtectCamera['state'], string> = {
  connected: 'ok',
  connecting: 'warn',
  disconnected: 'err',
  unknown: 'dim',
};

function cameraCols(events: ProtectEvent[], now: number): Column<ProtectCamera>[] {
  return [
    { id: 'name', title: 'name', width: 'minmax(12ch, 1.5fr)', render: (c) => c.name },
    { id: 'state', title: 'state', width: '14ch', render: (c) => <span className={`c-${STATE_TONE[c.state]}`}>● {c.state}</span> },
    {
      id: 'last',
      title: 'last event',
      width: 'minmax(16ch, 2fr)',
      render: (c) => {
        const last = headlineEvent(events.filter((e) => e.cameraId === c.id));
        if (!last) return <span className="c-faint">-</span>;
        return (
          <>
            {last.what} <span className="c-dim">{fmtAgo(last.start / 1000, now)}</span>
          </>
        );
      },
    },
    { id: 'model', title: 'model', width: 'minmax(12ch, 1fr)', min: 'md', render: (c) => <span className="c-dim">{c.model}</span> },
    { id: 'detects', title: 'detects', width: 'minmax(16ch, 2fr)', min: 'lg', render: (c) => <span className="c-dim">{c.detects.join(', ') || '-'}</span> },
  ];
}

function eventCols(now: number): Column<ProtectEvent>[] {
  return [
    { id: 'when', title: 'ago', width: '7ch', render: (e) => <span className="c-dim">{fmtAgo(e.start / 1000, now)}</span> },
    { id: 'camera', title: 'camera', width: 'minmax(12ch, 1fr)', render: (e) => e.camera },
    { id: 'what', title: 'what', width: 'minmax(14ch, 2fr)', render: (e) => <span className={e.motionOnly ? 'c-dim' : 'c-accent'}>{e.what}</span> },
    {
      id: 'lasted',
      title: 'lasted',
      width: '8ch',
      align: 'right',
      min: 'md',
      render: (e) => (e.end === null ? <span className="c-warn">now</span> : <span className="c-dim">{fmtAge((e.end - e.start) / 1000)}</span>),
    },
  ];
}

const clock = (ms: number) => new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

interface CamerasViewProps {
  snap: Snapshot<ProtectData> | null;
  cameras: ProtectCamera[];
  filter: string;
  sel: number;
  onSelect: (i: number) => void;
  now: number;
}

export function CamerasView({ snap, cameras, filter, sel, onSelect, now }: CamerasViewProps) {
  return (
    <Gate
      snap={snap}
      title="cameras"
      setup={
        <>
          cameras come from UniFi Protect. Set <code>UNIFI_URL</code> and <code>UNIFI_API_KEY</code>, and leave <code>UNIFI_PROTECT</code> unset.
        </>
      }
    >
      {(data) =>
        !data.available ? (
          <Box title="cameras">
            <Note>UniFi Protect was not found on this console.</Note>
          </Box>
        ) : (
          <div className="stack">
            <Box title="cameras" hint={filter ? `/${filter}` : 'all'} count={cameras.length}>
              <Table cols={cameraCols(data.events, now)} rows={cameras} rowKey={(c) => c.id} sel={sel} onSelect={onSelect} empty={<Note>no cameras</Note>} />
            </Box>
            <Box title="events" hint={data.since === null ? undefined : `since ${clock(data.since)}`} count={data.events.length}>
              {!data.live && (
                <Note tone="warn">
                  ⚠ the live event feed is not connected{data.feedError ? ` (${data.feedError})` : ''}. It retries on its own.
                </Note>
              )}
              <Table
                cols={eventCols(now)}
                rows={data.events.slice(0, 30)}
                rowKey={(e) => e.id}
                empty={<Note>nothing heard yet. Protect offers no history here, so this lists what happens while clearview is running.</Note>}
              />
            </Box>
          </div>
        )
      }
    </Gate>
  );
}
