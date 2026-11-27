import type { HostStats, Quote, Snapshot, WeatherData } from '@clearview/shared';
import type { ViewId } from '../lib/commands';
import { fmtAge, fmtBytes } from '../lib/format';
import { headerDisks } from '../lib/panels';
import { Bar } from './Bar';
import { HeaderWidget } from './HeaderWidget';
import { Logo } from './Logo';

interface HeaderProps {
  host: HostStats | null;
  weather: Snapshot<WeatherData> | null;
  quotes: Snapshot<Quote[]> | null;
  onNavigate: (view: ViewId) => void;
  onSetUpWidget: () => void;
}

/** "name ▮▮▮░░ 42%  detail"; a button when there is somewhere to go from it */
function Meter({ name, pct, detail, onClick }: { name: string; pct: number | null; detail?: string | null; onClick?: () => void }) {
  const content = (
    <>
      <span className="meter-name">{name}</span>
      <Bar pct={pct ?? 0} width={10} label={`${name} usage`} />
      <span className="meter-pct">{pct === null ? '…' : `${Math.round(pct)}%`}</span>
      <span className="meter-detail">{detail}</span>
    </>
  );
  return onClick ? (
    <button type="button" className="meter" onClick={onClick} title={`${name}: see all disks`}>
      {content}
    </button>
  ) : (
    <div className="meter" title={name}>
      {content}
    </div>
  );
}

export function Header({ host, weather, quotes, onNavigate, onSetUpWidget }: HeaderProps) {
  const disks = headerDisks(host?.disks ?? []);
  return (
    <header className="hdr">
      <div className="hdr-brand">
        <button type="button" className="home-button" onClick={() => onNavigate('home')} title="home">
          <Logo />
        </button>
        <div className="hdr-host">
          <strong>{host?.hostname ?? '…'}</strong>
          {host && <span className="c-dim"> up {fmtAge(host.uptimeSec)}</span>}
        </div>
        <div className="hdr-load c-dim" title="load average over the last 1, 5 and 15 minutes">
          load {host ? host.load.join(' ') : '…'}
        </div>
      </div>

      <div className="meters">
        <Meter name="cpu" pct={host?.cpuPct ?? null} detail={host && `${host.cpuCores} cores`} />
        <Meter name="mem" pct={host?.mem.usedPct ?? null} detail={host && `${fmtBytes(host.mem.usedBytes)}/${fmtBytes(host.mem.totalBytes)}`} />
        {disks.shown.map((d) => (
          <Meter key={d.mount} name={d.name} pct={d.usedPct} detail={`${fmtBytes(d.usedBytes)}/${fmtBytes(d.totalBytes)}`} onClick={() => onNavigate('disks')} />
        ))}
        {disks.hidden > 0 && (
          <button type="button" className="text-btn meters-more" onClick={() => onNavigate('disks')}>
            +{disks.hidden} more disk{disks.hidden === 1 ? '' : 's'}
          </button>
        )}
      </div>

      <HeaderWidget weather={weather} quotes={quotes} onConfigure={onSetUpWidget} />
    </header>
  );
}
