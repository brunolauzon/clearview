import type { ReactNode } from 'react';
import type { WeatherKind } from '../lib/format';

// Drawn as SVG rather than typed as symbols, so they look the same with every font and system.
// Each part has a class (wi-*) that theme.css colours from the active theme.

const sun = (
  <g className="wi-sun">
    <circle cx="12" cy="12" r="4.4" />
    <path d="M12 2.2v2.8M12 19v2.8M2.2 12H5M19 12h2.8M5.1 5.1l2 2M16.9 16.9l2 2M5.1 18.9l2-2M16.9 7.1l2-2" />
  </g>
);

const moon = <path className="wi-moon" d="M20 14.8A8.2 8.2 0 0 1 9.2 4a8.2 8.2 0 1 0 10.8 10.8z" />;

const smallSun = (
  <g className="wi-sun">
    <circle cx="8.5" cy="8.5" r="3.2" />
    <path d="M8.5 1.8v1.6M1.8 8.5h1.6M3.8 3.8 5 5M13.2 3.8 12 5M3.8 13.2 5 12" />
  </g>
);

const smallMoon = <path className="wi-moon" d="M12.6 10.2A5.6 5.6 0 0 1 5.4 3a5.6 5.6 0 1 0 7.2 7.2z" />;

/** low, front cloud used in the "partly cloudy" icons; its fill hides what is behind it */
const frontCloud = <path className="wi-cloud" d="M9.6 20.5h8.2a3.6 3.6 0 0 0 .5-7.16 4.9 4.9 0 0 0-9.3-.94A4.1 4.1 0 0 0 9.6 20.5z" />;

const bigCloud = <path className="wi-cloud" d="M6.8 19h10.6a4.4 4.4 0 0 0 .6-8.75 6 6 0 0 0-11.4-1.15A5 5 0 0 0 6.8 19z" />;

/** cloud raised to leave room underneath for what is falling from it */
const highCloud = <path className="wi-cloud" d="M7 14.2h10a4 4 0 0 0 .55-7.96 5.5 5.5 0 0 0-10.45-1A4.55 4.55 0 0 0 7 14.2z" />;

const ICONS: Record<WeatherKind, ReactNode> = {
  'clear-day': sun,
  'clear-night': moon,
  'partly-day': (
    <>
      {smallSun}
      {frontCloud}
    </>
  ),
  'partly-night': (
    <>
      {smallMoon}
      {frontCloud}
    </>
  ),
  cloudy: bigCloud,
  fog: (
    <>
      {highCloud}
      <path className="wi-fog" d="M4 17.6h16M7 21.2h10" />
    </>
  ),
  drizzle: (
    <>
      {highCloud}
      <path className="wi-drop" d="M8 17.4v.9M12 17.4v.9M16 17.4v.9M10 20.8v.9M14 20.8v.9" />
    </>
  ),
  rain: (
    <>
      {highCloud}
      <path className="wi-drop" d="M8.6 16.8 7.2 21.4M12.8 16.8l-1.4 4.6M17 16.8l-1.4 4.6" />
    </>
  ),
  snow: (
    <>
      {highCloud}
      <path
        className="wi-flake"
        d="M7.5 16.6v3.2M6.1 17.4l2.8 1.6M8.9 17.4 6.1 19M16.5 16.6v3.2M15.1 17.4l2.8 1.6M17.9 17.4 15.1 19M12 19v3.2M10.6 19.8l2.8 1.6M13.4 19.8l-2.8 1.6"
      />
    </>
  ),
  storm: (
    <>
      {highCloud}
      <path className="wi-bolt" d="M13 15.4 10 19.2h3.4l-2.2 3.6" />
    </>
  ),
  unknown: bigCloud,
};

export function WeatherIcon({ kind, label }: { kind: WeatherKind; label: string }) {
  return (
    <svg className="wx-icon" viewBox="0 0 24 24" role="img" aria-label={label} data-kind={kind}>
      {ICONS[kind]}
    </svg>
  );
}
