import type { AlertInfo, ContainerInfo, PlexData, ProtectData, Snapshot, TorrentData, UnifiData } from '@clearview/shared';
import { Bar } from '../components/Bar';
import { Box, Note } from '../components/Box';
import { fmtAge, fmtAgo, fmtBitrate, fmtBytes, fmtKbps } from '../lib/format';
import { headlineEvent, middlePanel, PLEX_STREAMS, recentRoom } from '../lib/panels';
import type { SortKey, StatsMap } from '../lib/rows';
import { SEVERITY_LABEL, SEVERITY_TONE } from './Alerts';
import { ContainersTable } from './Containers';
import { inlineState } from './Gate';

/** "⚠ error" above data that is no longer being refreshed. */
function Stale<T>({ snap }: { snap: Snapshot<T> | null }) {
  return snap && !snap.ok && snap.data ? <div className="line c-err">⚠ {snap.error}</div> : null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="line">
      <span className="row-label">{label}</span>
      {children}
    </div>
  );
}

/** Cameras online and the latest thing one of them saw; nothing at all without Protect. */
function CameraLines({ snap, now }: { snap: Snapshot<ProtectData> | null; now: number }) {
  if (!snap?.configured) return null;
  const d = snap.data;
  if (!d) return snap.error ? <div className="line c-err">⚠ {snap.error}</div> : null;
  if (!d.available) return null;
  const down = d.cameras.filter((c) => c.state !== 'connected');
  const latest = headlineEvent(d.events);
  return (
    <>
      <Stale snap={snap} />
      <Row label="cameras">
        <span className={down.length > 0 ? 'c-warn' : 'c-ok'}>
          {d.cameras.length - down.length}/{d.cameras.length} online
        </span>
        {!d.live && <span className="c-warn">events offline</span>}
      </Row>
      {down.slice(0, 2).map((c) => (
        <div key={c.id} className="line">
          <span className="c-err">●</span>
          <span className="grow-text">{c.name}</span>
          <span className="c-dim">{c.state}</span>
        </div>
      ))}
      <Row label="latest">
        {latest ? (
          <>
            <span className="grow-text">
              {latest.what} · {latest.camera}
            </span>
            <span className="c-dim">{fmtAgo(latest.start / 1000, now)}</span>
          </>
        ) : (
          <span className="c-dim">nothing seen yet</span>
        )}
      </Row>
    </>
  );
}

function NetworkPanel({ snap, protect, now }: { snap: Snapshot<UnifiData> | null; protect: Snapshot<ProtectData> | null; now: number }) {
  const note = inlineState(snap, 'unifi not configured · set UNIFI_URL and UNIFI_API_KEY');
  const d = snap?.data;
  const gw = d?.gateway;
  return (
    <Box title="network" hint={d?.site} className="panel">
      {note}
      <Stale snap={snap} />
      {d && (
        <>
          <Row label="wan">
            <span className="c-ok">▼ {fmtBitrate(gw?.rxBps)}</span>
            <span className="c-info">▲ {fmtBitrate(gw?.txBps)}</span>
          </Row>
          <Row label="clients">
            <span>{d.clients.total}</span>
            <span className="grow-text c-dim">
              wifi {d.clients.wireless} · wired {d.clients.wired}
              {d.clients.vpn > 0 && ` · vpn ${d.clients.vpn}`}
              {d.clients.guests > 0 && ` · guests ${d.clients.guests}`}
            </span>
          </Row>
          <Row label="devices">
            <span className={d.devices.problems.length > 0 ? 'c-warn' : 'c-ok'}>
              {d.devices.online}/{d.devices.total} online
            </span>
          </Row>
          {d.devices.problems.slice(0, 3).map((p) => (
            <div key={p.name} className="line">
              <span className="c-err">●</span>
              <span className="grow-text">{p.name}</span>
              <span className="c-dim">{p.state}</span>
            </div>
          ))}
          {d.devices.problems.length > 3 && <div className="c-dim">+{d.devices.problems.length - 3} more</div>}
          {gw ? (
            <Row label="gateway">
              {/* the box is already UniFi's, so the prefix only costs room */}
              <span className="grow-text">{(gw.model || gw.name).replace(/^UniFi /, '')}</span>
              <span className="c-dim">
                {gw.cpuPct !== null && `cpu ${Math.round(gw.cpuPct)}%`}
                {gw.memPct !== null && ` · mem ${Math.round(gw.memPct)}%`}
                {gw.uptimeSec !== null && ` · up ${fmtAge(gw.uptimeSec)}`}
              </span>
            </Row>
          ) : (
            <div className="c-dim">no gateway found on this site</div>
          )}
        </>
      )}
      <CameraLines snap={protect} now={now} />
    </Box>
  );
}

function AlertsPanel({ snap, now }: { snap: Snapshot<AlertInfo[]> | null; now: number }) {
  const note = inlineState(snap, 'grafana not configured · set GRAFANA_URL');
  const alerts = snap?.data ?? [];
  return (
    <Box title="alerts" count={snap?.data ? alerts.length : undefined} className="panel">
      {note}
      <Stale snap={snap} />
      {snap?.data && snap.ok && alerts.length === 0 && <Note tone="ok">✓ nothing firing</Note>}
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

function TorrentPanel({ snap, alertsClear }: { snap: Snapshot<TorrentData> | null; alertsClear: boolean }) {
  const note = inlineState(snap, 'deluge not configured · set DELUGE_URL and DELUGE_PASSWORD');
  const d = snap?.data;
  return (
    <Box title="torrents" count={d?.counts.total} className="panel">
      {alertsClear && <div className="line c-ok">✓ no alerts</div>}
      {note}
      <Stale snap={snap} />
      {d && (
        <>
          <div className="line">
            <span className="c-ok">▼ {fmtBytes(d.downloadBytesPerSec)}/s</span>
            <span className="c-info">▲ {fmtBytes(d.uploadBytesPerSec)}/s</span>
            {d.freeBytes !== null && <span className="c-dim">{fmtBytes(d.freeBytes)} free</span>}
          </div>
          <div className="line">
            <span className="grow-text c-dim">
              downloading {d.counts.downloading} · seeding {d.counts.seeding} · paused {d.counts.paused}
              {d.counts.queued > 0 && ` · queued ${d.counts.queued}`}
              {d.counts.checking > 0 && ` · checking ${d.counts.checking}`}
            </span>
            {d.counts.error > 0 && <span className="c-err">error {d.counts.error}</span>}
          </div>
          {d.active.slice(0, 3).map((t) => (
            <div key={t.name} className="line" title={`${t.name} · ${fmtBytes(t.sizeBytes)}`}>
              <span className="grow-text">{t.name}</span>
              <Bar pct={t.progressPct} width={8} level="info" />
              <span className="torrent-pct">{Math.floor(t.progressPct)}%</span>
              <span className="c-dim torrent-eta">{t.etaSec === null ? '' : fmtAge(t.etaSec)}</span>
            </div>
          ))}
          {d.active.length === 0 && <div className="line c-dim">nothing downloading</div>}
          {d.counts.downloading > 3 && <div className="c-dim">+{d.counts.downloading - 3} more downloading</div>}
        </>
      )}
    </Box>
  );
}

function PlexPanel({ snap, now }: { snap: Snapshot<PlexData> | null; now: number }) {
  const note = inlineState(snap, 'tautulli not configured · set TAUTULLI_URL');
  const d = snap?.data;
  const recent = d ? d.recent.slice(0, recentRoom(d.streams.length)) : [];
  return (
    <Box title="plex" count={d ? d.streamCount : undefined} className="panel">
      {note}
      {d && d.streamCount === 0 && <Note>▷ no active streams</Note>}
      {d && d.streamCount > 0 && (
        <div className="line c-dim">
          {d.transcodeCount} transcoding · {fmtKbps(d.totalBandwidthKbps)}
        </div>
      )}
      {d?.streams.slice(0, PLEX_STREAMS).map((s) => (
        <div key={s.id} className="line">
          <span className={s.state === 'playing' ? 'c-ok' : 'c-warn'}>{s.state === 'playing' ? '▶' : '❚❚'}</span>
          <span className="c-accent user">{s.user}</span>
          <span className="grow-text">{s.title}</span>
          <span className="c-dim">{Math.round(s.progressPct)}%</span>
        </div>
      ))}
      {d && d.streams.length > PLEX_STREAMS && <div className="c-dim">+{d.streams.length - PLEX_STREAMS} more · :plex</div>}
      {recent.length > 0 && (
        <>
          <div className="line c-dim">recently added</div>
          {recent.map((item) => (
            <div key={item.id} className="line">
              <span className="c-info">+</span>
              <span className="grow-text">{item.title}</span>
              <span className="c-dim">{fmtAgo(item.addedAt, now)}</span>
            </div>
          ))}
        </>
      )}
    </Box>
  );
}

interface HomeProps {
  unifi: Snapshot<UnifiData> | null;
  protect: Snapshot<ProtectData> | null;
  alerts: Snapshot<AlertInfo[]> | null;
  torrents: Snapshot<TorrentData> | null;
  plex: Snapshot<PlexData> | null;
  containers: ContainerInfo[];
  containersSnap: Snapshot<ContainerInfo[]> | null;
  sel: number;
  onSelect: (i: number) => void;
  hostIp: string | null;
  sort: SortKey;
  stats?: StatsMap;
  filter: string;
  now: number;
}

export function HomeView(props: HomeProps) {
  const { unifi, protect, alerts, torrents, plex, containers, containersSnap, sel, onSelect, hostIp, sort, stats, filter, now } = props;
  const error = containersSnap && !containersSnap.ok ? containersSnap.error : null;
  return (
    <div className="home">
      <div className="panels">
        <NetworkPanel snap={unifi} protect={protect} now={now} />
        {middlePanel(alerts, torrents) === 'alerts' ? (
          <AlertsPanel snap={alerts} now={now} />
        ) : (
          <TorrentPanel snap={torrents} alertsClear={alerts?.configured === true} />
        )}
        <PlexPanel snap={plex} now={now} />
      </div>
      <Box title="containers" hint={filter ? `/${filter}` : 'all'} count={containers.length} className="grow">
        {error && <Note tone="err">⚠ {error}</Note>}
        {!containersSnap ? (
          <Note>connecting…</Note>
        ) : (
          <ContainersTable rows={containers} sel={sel} onSelect={onSelect} hostIp={hostIp} sort={sort} stats={stats} />
        )}
      </Box>
    </div>
  );
}
