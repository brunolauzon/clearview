import type { Units, WeatherData } from '@clearview/shared';
import { fetchJson } from '../http';
import { round1 } from '../util';

// Open-Meteo (https://open-meteo.com): free for non-commercial use, no API key.
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** WMO weather interpretation codes, as Open-Meteo reports them. */
export function describeWeather(code: number): string {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Unknown';
}

/** "48.85, 2.35" -> coordinates; null when the text is not a latitude,longitude pair. */
export function parseCoordinates(text: string): { lat: number; lon: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

export interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
}

/**
 * "London, CA" or "Portland, Oregon": the geocoder only searches by name, so the words after the
 * comma are matched here against country, country code or region. Results arrive most prominent first.
 */
export function pickPlace(results: GeoResult[], qualifiers: string[]): GeoResult | null {
  const wanted = qualifiers.map((q) => q.trim().toLowerCase()).filter(Boolean);
  const match = results.find((r) => {
    const fields = [r.country, r.country_code, r.admin1].map((f) => f?.toLowerCase());
    return wanted.every((w) => fields.includes(w));
  });
  return match ?? null;
}

export interface RawForecast {
  current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
}

export function mapForecast(raw: RawForecast, place: string, units: Units): WeatherData {
  const temp = raw.current?.temperature_2m;
  const code = raw.current?.weather_code;
  if (typeof temp !== 'number' || typeof code !== 'number') throw new Error('weather: the forecast had no current conditions');
  const high = raw.daily?.temperature_2m_max?.[0];
  const low = raw.daily?.temperature_2m_min?.[0];
  return {
    place,
    temp: round1(temp),
    unit: units === 'imperial' ? 'F' : 'C',
    code,
    summary: describeWeather(code),
    isDay: raw.current?.is_day !== 0,
    high: typeof high === 'number' ? round1(high) : null,
    low: typeof low === 'number' ? round1(low) : null,
  };
}

interface Place {
  lat: number;
  lon: number;
  name: string;
}

export class WeatherSource {
  /** a place name only needs looking up once */
  private places = new Map<string, Place>();

  private async locate(location: string): Promise<Place> {
    const coords = parseCoordinates(location);
    if (coords) return { ...coords, name: `${coords.lat}, ${coords.lon}` };

    const known = this.places.get(location);
    if (known) return known;

    const [name = '', ...qualifiers] = location.split(',');
    const qs = new URLSearchParams({ name: name.trim(), count: '10', language: 'en', format: 'json' });
    const body = await fetchJson<{ results?: GeoResult[] }>('weather', `${GEOCODE_URL}?${qs}`);
    const hit = pickPlace(body.results ?? [], qualifiers);
    if (!hit) throw new Error(`weather: no place found for "${location}"`);
    const place = { lat: hit.latitude, lon: hit.longitude, name: hit.name };
    this.places.set(location, place);
    return place;
  }

  async collect(location: string, units: Units): Promise<WeatherData> {
    const place = await this.locate(location);
    const qs = new URLSearchParams({
      latitude: String(place.lat),
      longitude: String(place.lon),
      current: 'temperature_2m,weather_code,is_day',
      daily: 'temperature_2m_max,temperature_2m_min',
      temperature_unit: units === 'imperial' ? 'fahrenheit' : 'celsius',
      timezone: 'auto',
      forecast_days: '1',
    });
    return mapForecast(await fetchJson<RawForecast>('weather', `${FORECAST_URL}?${qs}`), place.name, units);
  }
}
