import type { Quote, Snapshot, WeatherData } from '@clearview/shared';
import { useNow } from '../hooks/useBucket';
import { fmtPrice, fmtSigned, priceDigits, weatherKind } from '../lib/format';
import { WeatherIcon } from './WeatherIcon';

interface HeaderWidgetProps {
  weather: Snapshot<WeatherData> | null;
  quotes: Snapshot<Quote[]> | null;
  onConfigure: () => void;
}

function Weather({ snap }: { snap: Snapshot<WeatherData> }) {
  const w = snap.data;
  if (!w) {
    return (
      <div className="c-dim" title={snap.error ?? undefined}>
        weather {snap.ok ? 'loading…' : 'unavailable'}
      </div>
    );
  }
  return (
    <div className={`wx-line${snap.ok ? '' : ' stale'}`} title={snap.error ?? `${w.summary} in ${w.place}`}>
      <span className="wx-temp">
        {Math.round(w.temp)}°{w.unit}
      </span>
      <span>{w.summary}</span>
      {w.high !== null && w.low !== null && (
        <span className="c-dim">
          {Math.round(w.high)}°/{Math.round(w.low)}°
        </span>
      )}
      <span className="c-dim wx-place">{w.place}</span>
    </div>
  );
}

function Ticker({ quote: q }: { quote: Quote }) {
  const digits = q.price === null ? 2 : priceDigits(q.price);
  return (
    <div className="ticker" title={q.error ?? [q.name, q.currency].filter(Boolean).join(' · ')}>
      <span className="sym">{q.symbol}</span>
      <span className="price">{q.price === null ? '-' : fmtPrice(q.price)}</span>
      {q.change !== null && q.changePct !== null ? (
        <span className={q.change > 0 ? 'c-ok' : q.change < 0 ? 'c-err' : 'c-dim'}>
          {q.change > 0 ? '▲' : q.change < 0 ? '▼' : '■'} {fmtSigned(q.change, digits)} ({fmtSigned(q.changePct, 2)}%)
        </span>
      ) : (
        <span className="c-faint">{q.error ?? ''}</span>
      )}
    </div>
  );
}

/** Date, local weather and stock ticker, in the header between the shortcuts and the logo. */
export function HeaderWidget({ weather, quotes, onConfigure }: HeaderWidgetProps) {
  const now = new Date(useNow(10_000));
  const nothingSet = weather !== null && quotes !== null && !weather.configured && !quotes.configured;
  const list = quotes?.data ?? [];

  return (
    <div className="hdr-widget">
      <div className="wx-block">
        {weather?.configured && weather.data && (
          <WeatherIcon kind={weatherKind(weather.data.code, weather.data.isDay)} label={weather.data.summary} />
        )}
        <div>
          <div className="wx-line">
            <span className="date">{now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span className="c-dim">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {weather?.configured && <Weather snap={weather} />}
        </div>
      </div>

      {quotes?.configured &&
        (list.length > 0 ? (
          <div className={`tickers${quotes.ok ? '' : ' stale'}`} title={quotes.error ?? undefined}>
            {list.map((q) => (
              <Ticker key={q.symbol} quote={q} />
            ))}
          </div>
        ) : (
          <div className="c-dim" title={quotes.error ?? undefined}>
            stocks {quotes.ok ? 'loading…' : 'unavailable'}
          </div>
        ))}

      {nothingSet && (
        <button type="button" className="hint widget-setup" onClick={onConfigure} tabIndex={-1}>
          <span className="hl">add weather and stocks in :config, general</span>
        </button>
      )}
    </div>
  );
}
