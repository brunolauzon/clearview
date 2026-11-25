import type { HostStats } from '@clearview/shared';
import { VIEWS, type ViewId } from '../lib/commands';
import { fmtAge, fmtBytes } from '../lib/format';
import { Bar } from './Bar';

// figlet "Calvin S"
const LOGO = `┌─┐┬  ┌─┐┌─┐┬─┐┬  ┬┬┌─┐┬ ┬
│  │  ├┤ ├─┤├┬┘└┐┌┘│├┤ │││
└─┘┴─┘└─┘┴ ┴┴└─ └┘ ┴└─┘└┴┘`;

interface HeaderProps {
  host: HostStats | null;
  alertCount: number;
  criticalCount: number;
  streamCount: number;
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

function Hint({ k, label, onClick }: { k: string; label: string; onClick?: () => void }) {
  return (
    <button type="button" className="hint" onClick={onClick} tabIndex={-1}>
      <span className="hk">&lt;{k}&gt;</span>
      <span className="hl">{label}</span>
    </button>
  );
}

export function Header({ host, alertCount, criticalCount, streamCount, onNavigate, onPrompt }: HeaderProps) {
  const views = VIEWS.filter((v) => v.key !== null);
  return (
    <header className="hdr">
      <div className="hdr-info">
        <Info k="Host">{host?.hostname ?? '…'}</Info>
        <Info k="Uptime">{host ? fmtAge(host.uptimeSec) : '…'}</Info>
        <Info k="Load">{host ? host.load.join(' ') : '…'}</Info>
        <div className="meter">
          <span className="k">CPU:</span>
          <Bar pct={host?.cpuPct ?? 0} width={14} />
          <span className="pct">{host ? `${Math.round(host.cpuPct)}%` : '…'}</span>
        </div>
        <div className="meter">
          <span className="k">MEM:</span>
          <Bar pct={host?.mem.usedPct ?? 0} width={14} />
          <span className="pct">{host ? `${Math.round(host.mem.usedPct)}%` : '…'}</span>
          {host && <span className="c-dim"> {fmtBytes(host.mem.usedBytes)}/{fmtBytes(host.mem.totalBytes)}</span>}
        </div>
      </div>

      <div className="hdr-keys" aria-label="shortcuts">
        {views.map((v) => (
          <Hint key={v.id} k={v.key!} label={v.id} onClick={() => onNavigate(v.id)} />
        ))}
        <Hint k=":" label="command" onClick={() => onPrompt('command')} />
        <Hint k="/" label="filter" onClick={() => onPrompt('filter')} />
        <Hint k="⏎" label="open webui" />
        <Hint k="?" label="help" onClick={() => onNavigate('help')} />
      </div>

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
