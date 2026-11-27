import type { ReactNode } from 'react';
import type { AlertInfo, PlexData, ProtectData, Snapshot, TorrentData, UnifiData } from '@clearview/shared';
import { Bar } from '../components/Bar';
import { Box, Note } from '../components/Box';
import type { ViewId } from '../lib/commands';
import { fmtAge, fmtAgo, fmtBitrate, fmtBytes, fmtKbps, resolveUrl } from '../lib/format';
import { GLYPH } from '../lib/glyphs';
import { headlineEvent, middlePanel, PLEX_STREAMS, recentRoom } from '../lib/panels';
import { SEVERITY_LABEL, SEVERITY_TONE } from './Alerts';
import { ContainersView, type ContainersTableProps } from './Containers';
import { inlineState } from './Gate';

/** "⚠ error" above data that is no longer being refreshed. */
function Stale<T>({ snap }: { snap: Snapshot<T> | null }) {
  return snap && !snap.ok && snap.data ? (
    <div className="line c-err" title={snap.error ?? undefined}>
      <span className="grow-text">
        {GLYPH.warn} {snap.error}
      </span>
    </div>
  ) : null;
}

/** A labelled line; long details move to a second line rather than being cut off. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="line labelled">
      <span className="row-label">{label}</span>
      <span className="row-value">{children}</span>
    </div>
  );
}

/** "a · b · c" that wraps between the items, never inside one. Empty items are left out. */
function Parts({ items }: { items: (string | false)[] }) {
  const shown = items.filter(Boolean) as string[];
  return (
    <span className="parts c-dim">
      {shown.map((item, i) => (
        <span key={item}>
          {item}
          {i < shown.length - 1 && ' ·'}
        </span>
      ))}
    </span>
  );
}

/** "+3 more" that goes to the view holding them. */
function More({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="text-btn" onClick={onClick}>
      {children}
    </button>
  );
}

/** Cameras online and the latest thing one of them saw; nothing at all without Protect. */
function CameraLines({ snap, now, onOpen }: { snap: Snapshot<ProtectData> | null; now: number; onOpen: () => void }) {
  if (!snap?.configured) return null;
  const d = snap.data;
  if (!d) return snap.error ? <Note tone="err">{snap.error}</Note> : null;
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
        <More onClick={onOpen}>view</More>
      </Row>
      {down.slice(0, 2).map((c) => (
        <div key={c.id} className="line" title={`${c.name} is ${c.state}`}>
          <span className="c-err" aria-hidden>
            {GLYPH.dot}
          </span>
          <span className="grow-text">{c.name}</span>
          <span className="c-dim">{c.state}</span>
        </div>
      ))}
      <div className="line labelled" title={latest ? `${latest.what} · ${latest.camera}` : undefined}>
        <span className="row-label">latest</span>
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
      </div>
    </>
  );
}

interface NetworkPanelProps {
  snap: Snapshot<UnifiData> | null;
  protect: Snapshot<ProtectData> | null;
  now: number;
  onNavigate: (view: ViewId) => void;
}

function NetworkPanel({ snap, protect, now, onNavigate }: NetworkPanelProps) {
  const note = inlineState(
    snap,
    'network',
    <>
      unifi not configured. set <code>UNIFI_URL</code> and <code>UNIFI_API_KEY</code>.
    </>,
  );
  const d = snap?.data;
  const gw = d?.gateway;
  return (
    <Box title="network" hint={d?.site} className="panel">
      {note}
      <Stale snap={snap} />
      {d && (
        <>
          <Row label="wan">
            <span className="c-ok" title="download">
              {GLYPH.down} {fmtBitrate(gw?.rxBps)}
            </span>
            <span className="c-info" title="upload">
              {GLYPH.up} {fmtBitrate(gw?.txBps)}
            </span>
          </Row>
          <Row label="clients">
            <span>{d.clients.total}</span>
            <Parts
              items={[
                `wifi ${d.clients.wireless}`,
                `wired ${d.clients.wired}`,
                d.clients.vpn > 0 && `vpn ${d.clients.vpn}`,
                d.clients.guests > 0 && `guests ${d.clients.guests}`,
              ]}
            />
          </Row>
          <Row label="devices">
            <span className={d.devices.problems.length > 0 ? 'c-warn' : 'c-ok'}>
              {d.devices.online}/{d.devices.total} online
            </span>
          </Row>
          {d.devices.problems.slice(0, 3).map((p) => (
            <div key={p.name} className="line" title={`${p.name} is ${p.state}`}>
              <span className="c-err" aria-hidden>
                {GLYPH.dot}
              </span>
              <span className="grow-text">{p.name}</span>
              <span className="c-dim">{p.state}</span>
            </div>
          ))}
          {d.devices.problems.length > 3 && <div className="c-dim">+{d.devices.problems.length - 3} more</div>}
          {gw ? (
            <Row label="gateway">
              {/* the box is already UniFi's, so the prefix only costs room */}
              <span>{(gw.model || gw.name).replace(/^UniFi /, '')}</span>
              <Parts
                items={[
                  gw.cpuPct !== null && `cpu ${Math.round(gw.cpuPct)}%`,
                  gw.memPct !== null && `mem ${Math.round(gw.memPct)}%`,
                  gw.uptimeSec !== null && `up ${fmtAge(gw.uptimeSec)}`,
                ]}
              />
            </Row>
          ) : (
            <div className="c-dim">no gateway found on this site</div>
          )}
        </>
      )}
      <CameraLines snap={protect} now={now} onOpen={() => onNavigate('cameras')} />
    </Box>
  );
}

interface AlertsPanelProps {
  snap: Snapshot<AlertInfo[]> | null;
  now: number;
  hostIp: string | null;
  onNavigate: (view: ViewId) => void;
}

function AlertsPanel({ snap, now, hostIp, onNavigate }: AlertsPanelProps) {
  const note = inlineState(
    snap,
    'alerts',
    <>
      grafana not configured. set <code>GRAFANA_URL</code>.
    </>,
  );
  const alerts = snap?.data ?? [];
  return (
    <Box title="alerts" count={snap?.data ? alerts.length : undefined} className="panel" onOpen={() => onNavigate('alerts')}>
      {note}
      <Stale snap={snap} />
      {snap?.data && snap.ok && alerts.length === 0 && <Note tone="ok">{GLYPH.check} nothing firing</Note>}
      {alerts.slice(0, 5).map((a) => {
        const url = resolveUrl(a.url, hostIp);
        const line = (
          <>
            <span className={`c-${SEVERITY_TONE[a.severity]}`}>
              {GLYPH.dot} {SEVERITY_LABEL[a.severity]}
            </span>
            <span className="grow-text">{a.name}</span>
            <span className="c-dim">{fmtAgo(a.startsAt, now)}</span>
          </>
        );
        const title = a.summary ? `${a.name}: ${a.summary}` : a.name;
        return url ? (
          <a key={a.id} className="line line-link" href={url} target="_blank" rel="noopener noreferrer" title={title}>
            {line}
          </a>
        ) : (
          <div key={a.id} className="line" title={title}>
            {line}
          </div>
        );
      })}
      {alerts.length > 5 && <More onClick={() => onNavigate('alerts')}>+{alerts.length - 5} more alerts</More>}
    </Box>
  );
}

function TorrentPanel({ snap, alertsClear }: { snap: Snapshot<TorrentData> | null; alertsClear: boolean }) {
  const note = inlineState(
    snap,
    'torrents',
    <>
      deluge not configured. set <code>DELUGE_URL</code> and <code>DELUGE_PASSWORD</code>.
    </>,
  );
  const d = snap?.data;
  return (
    <Box title="torrents" count={d?.counts.total} className="panel">
      {alertsClear && <div className="line c-ok">{GLYPH.check} no alerts</div>}
      {note}
      <Stale snap={snap} />
      {d && (
        <>
          <div className="line wraps">
            <span className="c-ok" title="download">
              {GLYPH.down} {fmtBytes(d.downloadBytesPerSec)}/s
            </span>
            <span className="c-info" title="upload">
              {GLYPH.up} {fmtBytes(d.uploadBytesPerSec)}/s
            </span>
            {d.freeBytes !== null && <span className="c-dim">{fmtBytes(d.freeBytes)} free</span>}
          </div>
          <div className="line wraps">
            <Parts
              items={[
                `downloading ${d.counts.downloading}`,
                `seeding ${d.counts.seeding}`,
                `paused ${d.counts.paused}`,
                d.counts.queued > 0 && `queued ${d.counts.queued}`,
                d.counts.checking > 0 && `checking ${d.counts.checking}`,
              ]}
            />
            {d.counts.error > 0 && <span className="c-err">error {d.counts.error}</span>}
          </div>
          {d.active.slice(0, 3).map((t) => (
            <div key={t.name} className="line" title={`${t.name} · ${fmtBytes(t.sizeBytes)}`}>
              <span className="grow-text">{t.name}</span>
              <Bar pct={t.progressPct} width={8} level="info" label={`${t.name} downloaded`} />
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

function PlexPanel({ snap, now, onNavigate }: { snap: Snapshot<PlexData> | null; now: number; onNavigate: (view: ViewId) => void }) {
  const note = inlineState(
    snap,
    'plex',
    <>
      tautulli not configured. set <code>TAUTULLI_URL</code> and <code>TAUTULLI_API_KEY</code>.
    </>,
  );
  const d = snap?.data;
  const recent = d ? d.recent.slice(0, recentRoom(d.streams.length)) : [];
  return (
    <Box title="plex" count={d ? d.streamCount : undefined} className="panel" onOpen={() => onNavigate('plex')}>
      {note}
      <Stale snap={snap} />
      {d && d.streamCount === 0 && <Note>no one is watching</Note>}
      {d && d.streamCount > 0 && (
        <div className="line c-dim">
          {d.transcodeCount} transcoding · {fmtKbps(d.totalBandwidthKbps)}
        </div>
      )}
      {d?.streams.slice(0, PLEX_STREAMS).map((s) => (
        <div key={s.id} className="line" title={`${s.user} · ${s.title} · ${s.state}`}>
          <span className={s.state === 'playing' ? 'c-ok' : 'c-warn'} role="img" aria-label={s.state}>
            {s.state === 'playing' ? GLYPH.play : GLYPH.pause}
          </span>
          <span className="c-accent user">{s.user}</span>
          <span className="grow-text">{s.title}</span>
          <span className="c-dim">{Math.round(s.progressPct)}%</span>
        </div>
      ))}
      {d && d.streams.length > PLEX_STREAMS && <More onClick={() => onNavigate('plex')}>+{d.streams.length - PLEX_STREAMS} more streams</More>}
      {recent.length > 0 && (
        <>
          <div className="line c-dim">recently added</div>
          {recent.map((item) => (
            <div key={item.id} className="line" title={`${item.title} · ${item.library}`}>
              <span className="c-info" aria-hidden>
                +
              </span>
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
  containers: ContainersTableProps & { loading: boolean; error: string | null };
  now: number;
  onNavigate: (view: ViewId) => void;
}

export function HomeView({ unifi, protect, alerts, torrents, plex, containers, now, onNavigate }: HomeProps) {
  return (
    <div className="home">
      <div className="panels">
        <NetworkPanel snap={unifi} protect={protect} now={now} onNavigate={onNavigate} />
        {middlePanel(alerts, torrents) === 'alerts' ? (
          <AlertsPanel snap={alerts} now={now} hostIp={containers.hostIp} onNavigate={onNavigate} />
        ) : (
          <TorrentPanel snap={torrents} alertsClear={alerts?.configured === true} />
        )}
        <PlexPanel snap={plex} now={now} onNavigate={onNavigate} />
      </div>
      <ContainersView {...containers} />
    </div>
  );
}
