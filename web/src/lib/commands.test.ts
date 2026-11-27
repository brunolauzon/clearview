import { describe, expect, it } from 'vitest';
import { parseCommand, suggest, viewFromHash } from './commands';

describe('parseCommand', () => {
  it('matches names, aliases and unique prefixes', () => {
    expect(parseCommand('plex')).toBe('plex');
    expect(parseCommand(':ctr')).toBe('containers');
    expect(parseCommand('  DF ')).toBe('disks');
    expect(parseCommand('cont')).toBe('containers');
    expect(parseCommand('q')).toBe('home');
    expect(parseCommand('c')).toBe('containers');
    expect(parseCommand('cam')).toBe('cameras');
    expect(parseCommand('protect')).toBe('cameras');
  });
  it('rejects empty and unknown input', () => {
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('nope')).toBeNull();
  });
});

describe('suggest', () => {
  it('returns the rest of the first matching view name', () => {
    expect(suggest('co')).toBe('ntainers');
    expect(suggest('pl')).toBe('ex');
    expect(suggest('plex')).toBe('');
    expect(suggest('')).toBe('');
    expect(suggest('zzz')).toBe('');
  });
});

describe('viewFromHash', () => {
  it('falls back to home', () => {
    expect(viewFromHash('#alerts')).toBe('alerts');
    expect(viewFromHash('#wat')).toBe('home');
    expect(viewFromHash('')).toBe('home');
  });
});
