import { barParts, levelOf, type Level } from '../lib/format';

interface BarProps {
  pct: number;
  width?: number;
  /** override the usage-based color (e.g. progress bars are not "bad" at 100%) */
  level?: Level | 'info';
}

export function Bar({ pct, width = 20, level }: BarProps) {
  const { full, empty } = barParts(pct, width);
  return (
    <span className={`bar ${level ?? levelOf(pct)}`} aria-label={`${Math.round(pct)}%`}>
      <span className="full">{full}</span>
      <span className="empty">{empty}</span>
    </span>
  );
}
