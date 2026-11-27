import { useEffect, useState } from 'react';

export type Bucket = 'sm' | 'md' | 'lg';

export const BUCKET_ORDER: Record<Bucket, number> = { sm: 0, md: 1, lg: 2 };

/**
 * Coarse viewport size, so tables can drop columns instead of wrapping. The widths are the ones
 * theme.css breaks at. Media queries, not window.innerWidth: a phone browser widens innerWidth to
 * fit a table that overflows, which would then keep the wide columns on screen for good.
 */
export function useBucket(): Bucket {
  const phone = useMedia('(max-width: 719px)');
  const narrow = useMedia('(max-width: 1049px)');
  return phone ? 'sm' : narrow ? 'md' : 'lg';
}

/** Whether a CSS media query matches, kept up to date. */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Re-render every `ms` so relative times ("3h ago") stay fresh. */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** True once `on` has held for `ms` without a break. */
export function useAfter(on: boolean, ms: number): boolean {
  const [due, setDue] = useState(false);
  useEffect(() => {
    if (!on) return setDue(false);
    const id = window.setTimeout(() => setDue(true), ms);
    return () => window.clearTimeout(id);
  }, [on, ms]);
  return on && due;
}
