import type { HostStats, Quote, Snapshot, WeatherData } from '@clearview/shared';
import { VIEWS, type ViewId } from '../lib/commands';
import { fmtAge, fmtBytes } from '../lib/format';
import { headerDisks } from '../lib/panels';
import { Bar } from './Bar';
import { HeaderWidget } from './HeaderWidget';

// figlet "Calvin S"
const LOGO = `┌─┐┬  ┌─┐┌─┐┬─┐┬  ┬┬┌─┐┬ ┬
│  │  ├┤ ├─┤├┬┘└┐┌┘│├┤ │││
└─┘┴─┘└─┘┴ ┴┴└─ └┘ ┴└─┘└┴┘`;

interface HeaderProps {
  host: HostStats | null;
  alertCount: number;
  criticalCount: number;
  streamCount: number;
  weather: Snapshot<WeatherData> | null;
  quotes: Snapshot<Quote[]> | null;
  onNavigate: (view: ViewId) => void;
  onPrompt: (mode: 'command' | 'filter') => void;
}

function Info({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}:</span>
      <span className="v">{children}</span>
    </div>
  );
}

/** "name: ███░░ 42%  detail" */
function Meter({ k, pct, detail, onClick }: { k: string; pct: number | null; detail?: React.ReactNode; onClick?: () => void }) {
  return (
    <div className={`meter${onClick ? ' clickable' : ''}`} onClick={onClick} title={k}>
      <span className="k">{k}:</span>
      <Bar pct={pct ?? 0} width={10} />
      <span className="pct">{pct === null ? '…' : `${Math.round(pct)}%`}</span>
      {detail && <span className="c-dim">{detail}</span>}
    </div>
  );
}

function Hint({ k, label, onClick }: { k: string; label: string; onClick?: () => void }) {
  return (
    <button type="button" className="hint" onClick={onClick} tabIndex={-1}>
      <span className="hk">&lt;{k}&gt;</span>
      <span className="hl">{label}</span>
    </button>
  );
}

export function Header({ host, alertCount, criticalCount, streamCount, weather, quotes, onNavigate, onPrompt }: HeaderProps) {
  const views = VIEWS.filter((v) => v.key !== null);
  const disks = headerDisks(host?.disks ?? []);
  return (
    <header className="hdr">
      <div className="hdr-info">
        <Info k="Host">
          {host?.hostname ?? '…'}
          {host && <span className="c-dim"> up {fmtAge(host.uptimeSec)}</span>}
        </Info>
        <Info k="Load">{host ? host.load.join(' ') : '…'}</Info>
        <Meter k="CPU" pct={host?.cpuPct ?? null} detail={host && `${host.cpuCores} cores`} />
        <Meter k="MEM" pct={host?.mem.usedPct ?? null} detail={host && `${fmtBytes(host.mem.usedBytes)}/${fmtBytes(host.mem.totalBytes)}`} />
        {disks.shown.map((d, i) => (
          <Meter
            key={d.mount}
            k={d.name}
            pct={d.usedPct}
            onClick={() => onNavigate('disks')}
            detail={
              <>
                {fmtBytes(d.usedBytes)}/{fmtBytes(d.totalBytes)}
                {i === disks.shown.length - 1 && disks.hidden > 0 && <span title={`${disks.hidden} more disks, see :disks`}> +{disks.hidden}</span>}
              </>
            }
          />
        ))}
      </div>

      <div className="hdr-keys" aria-label="shortcuts">
        {views.map((v) => (
          <Hint key={v.id} k={v.key!} label={v.id} onClick={() => onNavigate(v.id)} />
        ))}
        <Hint k=":" label="command" onClick={() => onPrompt('command')} />
        <Hint k="/" label="filter" onClick={() => onPrompt('filter')} />
        <Hint k="⏎" label="open webui" />
        <Hint k="e" label="edit container" />
        <Hint k="?" label="help" onClick={() => onNavigate('help')} />
      </div>

      <HeaderWidget weather={weather} quotes={quotes} onConfigure={() => onNavigate('config')} />

      <div className="hdr-brand">
        <pre className="logo" aria-label="clearview">
          {LOGO}
        </pre>
        <div className="badges">
          <button type="button" className={`badge ${criticalCount > 0 ? 'err' : alertCount > 0 ? 'warn' : 'ok'}`} onClick={() => onNavigate('alerts')} tabIndex={-1}>
            {alertCount > 0 ? `▲ ${alertCount} alert${alertCount === 1 ? '' : 's'}` : '✓ no alerts'}
          </button>
          <button type="button" className={`badge ${streamCount > 0 ? 'accent' : 'dim'}`} onClick={() => onNavigate('plex')} tabIndex={-1}>
            {streamCount > 0 ? `▶ ${streamCount} stream${streamCount === 1 ? '' : 's'}` : '▷ idle'}
          </button>
        </div>
      </div>
    </header>
  );
}
