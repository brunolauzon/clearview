import type { AlertInfo, ContainerInfo, HostStats, PlexData, Snapshot } from '@clearview/shared';
import { Bar } from '../components/Bar';
import { Box, Note } from '../components/Box';
import { fmtAgo, fmtBytes, fmtKbps, levelOf } from '../lib/format';
import type { SortKey } from '../lib/rows';
import { SEVERITY_LABEL, SEVERITY_TONE } from './Alerts';
import { ContainersTable } from './Containers';
import { inlineState } from './Gate';

function Meter({ label, pct, detail }: { label: string; pct: number; detail?: string }) {
  return (
    <div className="meter-row">
      <span className="meter-label">{label}</span>
      <Bar pct={pct} width={16} />
      <span className={`meter-pct c-${levelOf(pct)}`}>{pct.toFixed(0)}%</span>
      {detail && <span className="c-dim">{detail}</span>}
    </div>
  );
}

function HostPanel({ snap }: { snap: Snapshot<HostStats> | null }) {
  const note = inlineState(snap, 'host stats unavailable');
  const h = snap?.data;
  return (
    <Box title="host" className="panel">
      {note}
      {h && (
        <>
          <Meter label="cpu" pct={h.cpuPct} detail={`${h.cpuCores} cores`} />
          <Meter label="mem" pct={h.mem.usedPct} detail={`${fmtBytes(h.mem.usedBytes)}/${fmtBytes(h.mem.totalBytes)}`} />
          {h.disks.slice(0, 4).map((d) => (
            <Meter key={d.mount} label={d.name} pct={d.usedPct} detail={`${fmtBytes(d.usedBytes)}/${fmtBytes(d.totalBytes)}`} />
          ))}
          {h.disks.length > 4 && <div className="c-dim">+{h.disks.length - 4} more · :disks</div>}
        </>
      )}
    </Box>
  );
}

function AlertsPanel({ snap, now }: { snap: Snapshot<AlertInfo[]> | null; now: number }) {
  const note = inlineState(snap, 'grafana not configured · set GRAFANA_URL');
  const alerts = snap?.data ?? [];
  return (
    <Box title="alerts" count={snap?.data ? alerts.length : undefined} className="panel">
      {note}
      {snap?.data && alerts.length === 0 && <Note tone="ok">✓ nothing firing</Note>}
      {alerts.slice(0, 5).map((a) => (
        <div key={a.id} className="line">
          <span className={`c-${SEVERITY_TONE[a.severity]}`}>● {SEVERITY_LABEL[a.severity]}</span>
          <span className="grow-text">{a.name}</span>
          <span className="c-dim">{fmtAgo(a.startsAt, now)}</span>
        </div>
      ))}
      {alerts.length > 5 && <div className="c-dim">+{alerts.length - 5} more · :alerts</div>}
    </Box>
  );
}

function PlexPanel({ snap }: { snap: Snapshot<PlexData> | null }) {
  const note = inlineState(snap, 'tautulli not configured · set TAUTULLI_URL');
  const d = snap?.data;
  return (
    <Box title="plex" count={d ? d.streamCount : undefined} className="panel">
      {note}
      {d && d.streamCount === 0 && <Note>▷ no active streams</Note>}
      {d && d.streamCount > 0 && (
        <div className="line c-dim">
          {d.transcodeCount} transcoding · {fmtKbps(d.totalBandwidthKbps)}
        </div>
      )}
      {d?.streams.slice(0, 4).map((s) => (
        <div key={s.id} className="line">
          <span className={s.state === 'playing' ? 'c-ok' : 'c-warn'}>{s.state === 'playing' ? '▶' : '❚❚'}</span>
          <span className="c-accent user">{s.user}</span>
          <span className="grow-text">{s.title}</span>
          <span className="c-dim">{Math.round(s.progressPct)}%</span>
        </div>
      ))}
      {d && d.streams.length > 4 && <div className="c-dim">+{d.streams.length - 4} more · :plex</div>}
    </Box>
  );
}

interface HomeProps {
  host: Snapshot<HostStats> | null;
  alerts: Snapshot<AlertInfo[]> | null;
  plex: Snapshot<PlexData> | null;
  containers: ContainerInfo[];
  containersSnap: Snapshot<ContainerInfo[]> | null;
  sel: number;
  onSelect: (i: number) => void;
  hostIp: string | null;
  sort: SortKey;
  filter: string;
  now: number;
}

export function HomeView({ host, alerts, plex, containers, containersSnap, sel, onSelect, hostIp, sort, filter, now }: HomeProps) {
  const error = containersSnap && !containersSnap.ok ? containersSnap.error : null;
  return (
    <div className="home">
      <div className="panels">
        <HostPanel snap={host} />
        <AlertsPanel snap={alerts} now={now} />
        <PlexPanel snap={plex} />
      </div>
      <Box title="containers" hint={filter ? `/${filter}` : 'all'} count={containers.length} className="grow">
        {error && <Note tone="err">⚠ {error}</Note>}
        {!containersSnap ? <Note>connecting…</Note> : <ContainersTable rows={containers} sel={sel} onSelect={onSelect} hostIp={hostIp} sort={sort} />}
      </Box>
    </div>
  );
}
