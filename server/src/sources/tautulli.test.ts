import { describe, expect, it } from 'vitest';
import { mapActivity, mapDecision, mapHistory, mapHomeStats, mapLibraries } from './tautulli';

describe('mapDecision', () => {
  it('maps Tautulli "copy" to direct stream', () => {
    expect(mapDecision('direct play')).toBe('direct play');
    expect(mapDecision('copy')).toBe('direct stream');
    expect(mapDecision('transcode')).toBe('transcode');
    expect(mapDecision('')).toBe('unknown');
  });
});

describe('mapActivity', () => {
  it('coerces Tautulli string numbers and maps sessions', () => {
    const out = mapActivity({
      stream_count: '2',
      stream_count_transcode: '1',
      total_bandwidth: '9000',
      lan_bandwidth: '1000',
      wan_bandwidth: '8000',
      sessions: [
        {
          session_key: '12',
          friendly_name: 'alice',
          user: 'alice@example.com',
          full_title: 'Dune: Part Two',
          media_type: 'movie',
          player: 'Apple TV',
          platform: 'tvOS',
          state: 'playing',
          transcode_decision: 'transcode',
          quality_profile: '8 Mbps 1080p',
          progress_percent: '41',
          bandwidth: '8000',
          location: 'wan',
        },
        { session_key: '13', user: 'bob', title: 'Pilot', state: 'paused', transcode_decision: 'direct play', location: 'lan' },
      ],
    });
    expect(out.streamCount).toBe(2);
    expect(out.transcodeCount).toBe(1);
    expect(out.totalBandwidthKbps).toBe(9000);
    expect(out.streams[0]).toMatchObject({
      user: 'alice',
      title: 'Dune: Part Two',
      state: 'playing',
      decision: 'transcode',
      quality: '8 Mbps 1080p',
      progressPct: 41,
      bandwidthKbps: 8000,
      location: 'wan',
    });
    expect(out.streams[1]).toMatchObject({ user: 'bob', title: 'Pilot', state: 'paused', quality: null, bandwidthKbps: 0 });
  });

  it('handles an idle server', () => {
    const out = mapActivity({ stream_count: '0', sessions: [] });
    expect(out.streams).toEqual([]);
    expect(out.streamCount).toBe(0);
  });
});

describe('mapLibraries', () => {
  it('only reports child counts for non-movie libraries', () => {
    const out = mapLibraries([
      { section_name: 'Movies', section_type: 'movie', count: '1200', child_count: '' },
      { section_name: 'TV', section_type: 'show', count: '140', child_count: '6900' },
    ]);
    expect(out).toEqual([
      { name: 'Movies', type: 'movie', count: 1200, childCount: null },
      { name: 'TV', type: 'show', count: 140, childCount: 6900 },
    ]);
  });
});

describe('mapHistory', () => {
  it('maps rows from the nested data array', () => {
    const out = mapHistory({
      data: [{ friendly_name: 'bob', full_title: 'Andor - Reckoning', media_type: 'episode', player: 'TV', stopped: 1700000000, percent_complete: 100 }],
    });
    expect(out).toEqual([
      { user: 'bob', title: 'Andor - Reckoning', mediaType: 'episode', player: 'TV', stoppedAt: 1700000000, percentComplete: 100 },
    ]);
  });
});

describe('mapHomeStats', () => {
  it('keeps users, movies and shows in a stable order, five rows max', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ title: `m${i}`, total_plays: 8 - i }));
    const out = mapHomeStats([
      { stat_id: 'top_tv', rows: [{ title: 'Severance', total_plays: 38 }] },
      { stat_id: 'last_watched', rows: [] },
      { stat_id: 'top_movies', rows },
      { stat_id: 'top_users', rows: [{ friendly_name: 'bob', total_plays: 142 }] },
    ]);
    expect(out.map((s) => s.id)).toEqual(['top_users', 'top_movies', 'top_tv']);
    expect(out[1]!.rows).toHaveLength(5);
    expect(out[0]!.rows[0]).toEqual({ label: 'bob', plays: 142 });
  });
});
