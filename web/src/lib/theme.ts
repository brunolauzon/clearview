// The look is a theme (a full palette, see shared/themes.ts) with two optional overrides, the
// background and the accent. It is applied as CSS variables on <html>, which win over the built-in
// values in theme.css.

import { DEFAULT_THEME_ID, THEMES, type Palette, type Theme } from '../../../shared/themes';

export interface Look {
  theme: string | null;
  background: string | null;
  accent: string | null;
}

const DARK_TEXT = '#15100e';
const LIGHT_TEXT = '#ffffff';

/** Quick accent choices offered next to the free picker. */
export const PRESETS: { name: string; hex: string }[] = [
  { name: 'orange', hex: '#d97757' },
  { name: 'amber', hex: '#e8b64c' },
  { name: 'green', hex: '#62d08a' },
  { name: 'teal', hex: '#4fd1c5' },
  { name: 'blue', hex: '#6ea8ff' },
  { name: 'purple', hex: '#a78bfa' },
  { name: 'pink', hex: '#f472b6' },
  { name: 'red', hex: '#f2616b' },
];

/** Text and status colours for a light background chosen on top of a dark theme. */
const LIGHT_BASE: Omit<Palette, 'bg' | 'bgAlt' | 'border' | 'faint' | 'dim'> = {
  fg: '#2b2b33',
  strong: '#000000',
  accent: '#a8431f',
  ok: '#1f7a3d',
  warn: '#8a5a00',
  err: '#b3261e',
  info: '#1d5fc4',
};

export function findTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;
}

/** "#3B82F6", "3b82f6" or "#38f" to "#3b82f6"; null when it is not a hex colour. */
export function normalizeHex(input: string): string | null {
  const m = input.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1]!.toLowerCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return `#${h}`;
}

const channels = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** WCAG relative luminance, 0 (black) to 1 (white). Expects #rrggbb. */
export function luminance(hex: string): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two #rrggbb colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `amount` of the way from colour a to colour b (0 = a, 1 = b). */
export function mix(a: string, b: string, amount: number): string {
  const from = channels(a);
  const to = channels(b);
  return `#${from.map((v, i) => Math.round(v + (to[i]! - v) * amount).toString(16).padStart(2, '0')).join('')}`;
}

/** True when black text reads better on this colour than white text. */
export const isLightColor = (hex: string): boolean => contrast(hex, '#000000') > contrast(hex, '#ffffff');

/** Dark or white text, whichever reads better on this background. */
export function readableOn(background: string): string {
  return contrast(background, DARK_TEXT) >= contrast(background, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT;
}

/** The accent is used as text on the page, so it must stand out from it. 3:1 is the WCAG bar for large or bold text. */
export function isReadable(accent: string, background: string): boolean {
  return contrast(accent, background) >= 3;
}

/**
 * The colours to paint. A custom background keeps the theme's text colours if it is the same kind
 * (dark or light) and derives the surfaces from it; a light background on a dark theme (or the
 * reverse) switches to text and status colours made for that kind.
 */
export function resolvePalette(look: Look): { colors: Palette; light: boolean } {
  const theme = findTheme(look.theme);
  let colors: Palette = { ...theme.colors };
  let light = theme.light;

  const bg = look.background ? normalizeHex(look.background) : null;
  if (bg && bg !== colors.bg) {
    light = isLightColor(bg);
    const base = light === theme.light ? theme.colors : light ? LIGHT_BASE : findTheme(DEFAULT_THEME_ID).colors;
    colors = {
      ...base,
      bg,
      bgAlt: mix(bg, base.fg, 0.07),
      border: mix(bg, base.fg, 0.22),
      faint: mix(bg, base.fg, 0.32),
      dim: mix(bg, base.fg, 0.62),
    };
  }

  const accent = look.accent ? normalizeHex(look.accent) : null;
  if (accent) colors.accent = accent;
  return { colors, light };
}

const CSS_NAMES: Record<keyof Palette, string> = {
  bg: '--bg',
  bgAlt: '--bg-alt',
  fg: '--fg',
  strong: '--strong',
  dim: '--dim',
  faint: '--faint',
  border: '--border',
  accent: '--accent',
  ok: '--ok',
  warn: '--warn',
  err: '--err',
  info: '--info',
};

export function applyLook(look: Look): void {
  if (typeof document === 'undefined') return;
  const { colors, light } = resolvePalette(look);
  const style = document.documentElement.style;
  for (const key of Object.keys(CSS_NAMES) as (keyof Palette)[]) style.setProperty(CSS_NAMES[key], colors[key]);
  // text drawn on top of the accent: the selected row, the active tab
  style.setProperty('--accent-fg', readableOn(colors.accent));
  style.colorScheme = light ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.bg);
}

// Remember the last look in this browser so the page paints in it at once, instead of
// flashing the default colours until the server's settings arrive.
const CACHE_KEY = 'clearview.look';

export function loadCachedLook(): Look | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Look>;
    return { theme: v.theme ?? null, background: v.background ?? null, accent: v.accent ?? null };
  } catch {
    return null;
  }
}

export function cacheLook(look: Look): void {
  try {
    if (look.theme || look.background || look.accent) localStorage.setItem(CACHE_KEY, JSON.stringify(look));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* storage unavailable: the colours just won't be remembered */
  }
}
