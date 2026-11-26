// The accent colour is a CSS variable (--accent). The built-in value lives in theme.css; a configured
// colour is set on <html> as an inline style, which wins. --accent-fg is the text colour used on top of
// the accent (the selected row, active tab), picked for contrast.

export const DEFAULT_ACCENT = '#d97757';

const PAGE_BG = '#0d0d0f';
const DARK_TEXT = '#15100e';
const LIGHT_TEXT = '#ffffff';

export const PRESETS: { name: string; hex: string }[] = [
  { name: 'orange', hex: DEFAULT_ACCENT },
  { name: 'amber', hex: '#e8b64c' },
  { name: 'green', hex: '#62d08a' },
  { name: 'teal', hex: '#4fd1c5' },
  { name: 'blue', hex: '#6ea8ff' },
  { name: 'purple', hex: '#a78bfa' },
  { name: 'pink', hex: '#f472b6' },
  { name: 'red', hex: '#f2616b' },
];

/** "#3B82F6", "3b82f6" or "#38f" to "#3b82f6"; null when it is not a hex colour. */
export function normalizeHex(input: string): string | null {
  const m = input.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1]!.toLowerCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return `#${h}`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). Expects #rrggbb. */
export function luminance(hex: string): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** WCAG contrast ratio between two #rrggbb colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Dark or white text, whichever reads better on this background. */
export function readableOn(background: string): string {
  return contrast(background, DARK_TEXT) >= contrast(background, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT;
}

/** The accent is used as text on the page background, so it must stand out from it. 3:1 is the WCAG bar for large or bold text. */
export function isReadable(accent: string): boolean {
  return contrast(accent, PAGE_BG) >= 3;
}

/** Use this accent now; null or an invalid value goes back to the built-in colour. */
export function applyAccent(hex: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  const h = hex ? normalizeHex(hex) : null;
  if (!h) {
    style.removeProperty('--accent');
    style.removeProperty('--accent-fg');
    return;
  }
  style.setProperty('--accent', h);
  style.setProperty('--accent-fg', readableOn(h));
}

// Remember the last colour in this browser so the page paints in it at once, instead of
// flashing orange until the server's settings arrive.
const CACHE_KEY = 'clearview.accent';

export function loadCachedAccent(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
}

export function cacheAccent(hex: string | null): void {
  try {
    if (hex) localStorage.setItem(CACHE_KEY, hex);
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* storage unavailable: the colour just won't be remembered */
  }
}
