import { describe, expect, it } from 'vitest';
import { matchViews, viewFromHash } from './commands';

describe('matchViews', () => {
  const ids = (input: string) => matchViews(input).map((v) => v.id);
  it('opens the expected view for names, aliases and the start of a name', () => {
    const first = (input: string) => matchViews(input)[0]?.id;
    expect([':ctr', '  DF ', 'cont', 'q', 'c', 'cam', 'protect'].map(first)).toEqual(['containers', 'disks', 'containers', 'home', 'containers', 'cameras', 'cameras']);
  });
  it('puts an exact name or alias first, then names that start with the text', () => {
    expect(ids('c')).toEqual(['containers', 'config', 'cameras']);
    expect(ids('co')).toEqual(['containers', 'config']);
    expect(ids(':PL')).toEqual(['plex']);
  });
  it('matches the start of an alias, and offers everything for nothing', () => {
    expect(ids('graf')).toEqual(['alerts']);
    expect(ids('')).toHaveLength(9);
    expect(ids('zzz')).toEqual([]);
  });
});

describe('viewFromHash', () => {
  it('falls back to home', () => {
    expect(viewFromHash('#alerts')).toBe('alerts');
    expect(viewFromHash('#wat')).toBe('home');
    expect(viewFromHash('')).toBe('home');
  });
});
