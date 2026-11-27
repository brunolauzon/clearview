import { levelOf, type Level } from '../lib/format';

interface BarProps {
  pct: number;
  /** width in characters; each block is one character wide */
  width?: number;
  /** override the usage-based color (e.g. progress bars are not "bad" at 100%) */
  level?: Level | 'info';
  /** what is being measured, for screen readers */
  label?: string;
}

/** A terminal-style block meter. Drawn with CSS, not block characters, so it is the same on every system. */
export function Bar({ pct, width = 20, level, label = 'usage' }: BarProps) {
  const value = Math.min(100, Math.max(0, pct));
  return (
    <span
      className={`bar ${level ?? levelOf(pct)}`}
      style={{ '--cells': width } as React.CSSProperties}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <span className="bar-fill" style={{ width: `${value}%` }} />
    </span>
  );
}
