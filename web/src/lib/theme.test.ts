import { describe, expect, it } from 'vitest';
import { applyAccent, cacheAccent, contrast, DEFAULT_ACCENT, isReadable, loadCachedAccent, luminance, normalizeHex, PRESETS, readableOn } from './theme';

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

describe('contrast', () => {
  it('has the known extremes', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrast('#d97757', '#d97757')).toBe(1);
  });
});

describe('readableOn', () => {
  it('puts dark text on light colours and white text on dark ones', () => {
    expect(readableOn('#d97757')).toBe('#15100e'); // the default orange
    expect(readableOn('#e8b64c')).toBe('#15100e');
    expect(readableOn('#1e3a8a')).toBe('#ffffff');
    expect(readableOn('#6d28d9')).toBe('#ffffff');
  });
});

describe('isReadable', () => {
  it('rejects colours that disappear on the dark page', () => {
    expect(isReadable('#111111')).toBe(false);
    expect(isReadable('#1e3a8a')).toBe(false);
    expect(isReadable('#d97757')).toBe(true);
    expect(isReadable('#ffffff')).toBe(true);
  });
  it('accepts every preset', () => {
    for (const p of PRESETS) {
      expect(normalizeHex(p.hex)).toBe(p.hex);
      expect(isReadable(p.hex), p.name).toBe(true);
    }
    expect(PRESETS[0]?.hex).toBe(DEFAULT_ACCENT);
  });
});

describe('without a browser', () => {
  it('applyAccent and the cache do nothing instead of throwing', () => {
    expect(() => applyAccent('#3b82f6')).not.toThrow();
    expect(() => cacheAccent('#3b82f6')).not.toThrow();
    expect(loadCachedAccent()).toBeNull();
  });
});
