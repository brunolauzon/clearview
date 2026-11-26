import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeWeather, mapForecast, parseCoordinates, pickPlace, WeatherSource, type GeoResult } from './weather';

describe('describeWeather', () => {
  it('names the WMO code groups', () => {
    expect([0, 1, 2, 3, 48, 55, 63, 75, 81, 86, 96].map(describeWeather)).toEqual([
      'Clear', 'Mostly clear', 'Partly cloudy', 'Overcast', 'Fog', 'Drizzle', 'Rain', 'Snow', 'Showers', 'Snow showers', 'Thunderstorm',
    ]);
    expect(describeWeather(999 - 960)).toBe('Unknown');
  });
});

describe('parseCoordinates', () => {
  it('reads a latitude,longitude pair', () => {
    expect(parseCoordinates('48.85, 2.35')).toEqual({ lat: 48.85, lon: 2.35 });
    expect(parseCoordinates('-33.9,151.2')).toEqual({ lat: -33.9, lon: 151.2 });
  });
  it('rejects names and impossible values', () => {
    expect(parseCoordinates('Paris')).toBeNull();
    expect(parseCoordinates('London, CA')).toBeNull();
    expect(parseCoordinates('95, 10')).toBeNull();
    expect(parseCoordinates('10, 200')).toBeNull();
  });
});

const london: GeoResult[] = [
  { name: 'London', latitude: 51.5, longitude: -0.12, country: 'United Kingdom', country_code: 'GB', admin1: 'England' },
  { name: 'London', latitude: 42.98, longitude: -81.23, country: 'Canada', country_code: 'CA', admin1: 'Ontario' },
];

describe('pickPlace', () => {
  it('takes the most prominent result when nothing narrows it', () => {
    expect(pickPlace(london, [])?.country_code).toBe('GB');
  });
  it('matches country code, country name or region, ignoring case', () => {
    expect(pickPlace(london, [' ca'])?.admin1).toBe('Ontario');
    expect(pickPlace(london, ['canada'])?.admin1).toBe('Ontario');
    expect(pickPlace(london, ['Ontario', 'CA'])?.country_code).toBe('CA');
  });
  it('returns nothing rather than the wrong place', () => {
    expect(pickPlace(london, ['France'])).toBeNull();
    expect(pickPlace([], [])).toBeNull();
  });
});

// shape taken from a real Open-Meteo response
const forecast = {
  current: { time: '2026-11-26T22:00', temperature_2m: 3.34, weather_code: 3, is_day: 0 },
  daily: { temperature_2m_max: [6.0], temperature_2m_min: [2.6] },
};

describe('mapForecast', () => {
  it('maps current conditions and today’s range', () => {
    expect(mapForecast(forecast, 'London', 'metric')).toEqual({
      place: 'London', temp: 3.3, unit: 'C', code: 3, summary: 'Overcast', isDay: false, high: 6, low: 2.6,
    });
    expect(mapForecast(forecast, 'London', 'imperial').unit).toBe('F');
  });
  it('allows a missing daily range but not missing current conditions', () => {
    expect(mapForecast({ current: forecast.current }, 'x', 'metric')).toMatchObject({ high: null, low: null });
    expect(() => mapForecast({}, 'x', 'metric')).toThrow(/no current conditions/);
  });
});

describe('WeatherSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(results: GeoResult[]) {
    const calls: URL[] = [];
    vi.stubGlobal('fetch', async (input: string) => {
      const url = new URL(input);
      calls.push(url);
      const body = url.hostname.startsWith('geocoding') ? { results } : forecast;
      return new Response(JSON.stringify(body), { status: 200 });
    });
    return calls;
  }

  it('looks a place up once, then reuses it, and asks for the right units', async () => {
    const calls = stub(london);
    const source = new WeatherSource();
    expect((await source.collect('London, CA', 'imperial')).place).toBe('London');
    await source.collect('London, CA', 'imperial');
    expect(calls.map((c) => c.hostname.split('.')[0])).toEqual(['geocoding-api', 'api', 'api']);
    expect(calls[0]!.searchParams.get('name')).toBe('London');
    expect(calls[1]!.searchParams.get('latitude')).toBe('42.98');
    expect(calls[1]!.searchParams.get('temperature_unit')).toBe('fahrenheit');
  });

  it('skips the lookup for coordinates', async () => {
    const calls = stub([]);
    const out = await new WeatherSource().collect('48.85, 2.35', 'metric');
    expect(out.place).toBe('48.85, 2.35');
    expect(calls).toHaveLength(1);
  });

  it('says when a place cannot be found', async () => {
    stub([]);
    await expect(new WeatherSource().collect('Nowhereville', 'metric')).rejects.toThrow(/no place found for "Nowhereville"/);
  });
});
