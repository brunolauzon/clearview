/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_ID, THEME_IDS, THEMES } from '../../../shared/themes';
import {
  applyLook,
  cacheLook,
  contrast,
  findTheme,
  isLightColor,
  isReadable,
  loadCachedLook,
  luminance,
  mix,
  normalizeHex,
  PRESETS,
  readableOn,
  resolvePalette,
} from './theme';

const none = { theme: null, background: null, accent: null };

describe('normalizeHex', () => {
  it('accepts 3 and 6 digit codes with or without #, in any case', () => {
    expect(normalizeHex('#3B82F6')).toBe('#3b82f6');
    expect(normalizeHex('3b82f6')).toBe('#3b82f6');
    expect(normalizeHex(' #38f ')).toBe('#3388ff');
  });
  it('rejects anything else', () => {
    for (const bad of ['', '#', 'blue', '#12345', '#1234567', '#ggg', 'rgb(1,2,3)']) expect(normalizeHex(bad)).toBeNull();
  });
});

describe('colour maths', () => {
  it('has the known extremes', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
  });
  it('mixes between two colours', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
  it('tells light from dark and picks text for each', () => {
    expect(isLightColor('#fdf6e3')).toBe(true);
    expect(isLightColor('#282a36')).toBe(false);
    expect(readableOn('#d97757')).toBe('#15100e');
    expect(readableOn('#1e3a8a')).toBe('#ffffff');
  });
});

describe('themes', () => {
  it('has unique ids, the default first, and the popular terminal schemes', () => {
    expect(new Set(THEME_IDS).size).toBe(THEME_IDS.length);
    expect(THEME_IDS[0]).toBe(DEFAULT_THEME_ID);
    for (const id of ['dracula', 'nord', 'gruvbox', 'tokyo-night', 'catppuccin-mocha', 'one-dark', 'monokai', 'solarized-dark']) {
      expect(THEME_IDS).toContain(id);
    }
  });

  it.each(THEMES.map((t) => [t.id, t] as const))('%s is complete and readable', (_id, t) => {
    const c = t.colors;
    for (const value of Object.values(c)) expect(normalizeHex(value)).toBe(value);
    expect(isLightColor(c.bg)).toBe(t.light);
    expect(contrast(c.fg, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.strong, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(isReadable(c.accent, c.bg)).toBe(true);
    expect(contrast(c.dim, c.bg)).toBeGreaterThanOrEqual(2.5);
    // status colours are bold glyphs and short words; the light schemes' published yellows are the weakest
    for (const status of [c.ok, c.warn, c.err, c.info]) expect(contrast(status, c.bg)).toBeGreaterThanOrEqual(2.3);
  });

  it('default theme matches the :root values in the stylesheet', () => {
    const css = fs.readFileSync(path.join(import.meta.dirname, '../theme.css'), 'utf8');
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
    const value = (name: string) => root.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6});`))?.[1];
    const c = findTheme(DEFAULT_THEME_ID).colors;
    expect(value('--bg')).toBe(c.bg);
    expect(value('--bg-alt')).toBe(c.bgAlt);
    for (const key of ['fg', 'strong', 'dim', 'faint', 'border', 'accent', 'ok', 'warn', 'err', 'info'] as const) {
      expect(value(`--${key}`), key).toBe(c[key]);
    }
  });

  it('keeps every accent preset readable on the default background', () => {
    for (const p of PRESETS) expect(isReadable(p.hex, findTheme(null).colors.bg), p.name).toBe(true);
  });
});

describe('resolvePalette', () => {
  it('falls back to the default theme for nothing or an unknown name', () => {
    expect(resolvePalette(none).colors).toEqual(findTheme(DEFAULT_THEME_ID).colors);
    expect(resolvePalette({ ...none, theme: 'nope' }).colors.bg).toBe(findTheme(null).colors.bg);
  });

  it('uses the chosen theme, with an accent override on top', () => {
    expect(resolvePalette({ ...none, theme: 'dracula' }).colors.accent).toBe('#bd93f9');
    const custom = resolvePalette({ ...none, theme: 'dracula', accent: '#FF79C6' });
    expect(custom.colors.accent).toBe('#ff79c6');
    expect(custom.colors.bg).toBe('#282a36');
  });

  it('keeps the theme’s text colours for a custom background of the same kind', () => {
    const r = resolvePalette({ ...none, theme: 'nord', background: '#101820' });
    expect(r.light).toBe(false);
    expect(r.colors).toMatchObject({ bg: '#101820', fg: '#d8dee9', ok: '#a3be8c' });
    expect(r.colors.border).not.toBe(findTheme('nord').colors.border);
  });

  it('switches to readable text for a light background on a dark theme, and the reverse', () => {
    const light = resolvePalette({ ...none, theme: 'dracula', background: '#ffffff' });
    expect(light.light).toBe(true);
    for (const colour of [light.colors.fg, light.colors.accent, light.colors.ok, light.colors.warn, light.colors.err, light.colors.info]) {
      expect(contrast(colour, '#ffffff'), colour).toBeGreaterThanOrEqual(4.5);
    }
    const dark = resolvePalette({ ...none, theme: 'solarized-light', background: '#000000' });
    expect(dark.light).toBe(false);
    expect(contrast(dark.colors.fg, '#000000')).toBeGreaterThanOrEqual(4.5);
  });

  it('ignores a background that is not a colour', () => {
    expect(resolvePalette({ ...none, background: 'banana' }).colors.bg).toBe(findTheme(null).colors.bg);
  });
});

describe('without a browser', () => {
  it('applying and caching do nothing instead of throwing', () => {
    expect(() => applyLook({ ...none, theme: 'nord' })).not.toThrow();
    expect(() => cacheLook({ ...none, theme: 'nord' })).not.toThrow();
    expect(loadCachedLook()).toBeNull();
  });
});
