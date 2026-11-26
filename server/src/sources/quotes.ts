import type { Quote } from '@clearview/shared';
import { fetchJson } from '../http';
import { errMsg, mapLimit } from '../util';

// Yahoo Finance's chart endpoint: needs no key, but it is not an official, supported API. It can
// change or rate limit without notice, and some exchanges are delayed. Everything Yahoo-specific
// lives in this file so another provider could replace it.
const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
// requests without a browser-like User-Agent are refused with HTTP 429
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (clearview dashboard)', Accept: 'application/json' };

export interface RawChart {
  chart?: {
    result?: { meta?: Record<string, unknown> }[] | null;
  };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function noQuote(symbol: string, error: string): Quote {
  return { symbol, name: null, price: null, change: null, changePct: null, currency: null, error };
}

/** Today's change is the latest price against the previous session's close. */
export function mapQuote(symbol: string, raw: RawChart): Quote {
  const meta = raw.chart?.result?.[0]?.meta;
  const price = num(meta?.regularMarketPrice);
  if (!meta || price === null) return noQuote(symbol, 'no price');
  const previous = num(meta.chartPreviousClose) ?? num(meta.previousClose);
  const change = previous !== null && previous !== 0 ? price - previous : null;
  return {
    symbol,
    name: str(meta.shortName) ?? str(meta.longName),
    price,
    change,
    changePct: change !== null ? (change / previous!) * 100 : null,
    currency: str(meta.currency),
    error: null,
  };
}

async function fetchQuote(symbol: string): Promise<Quote> {
  try {
    const url = `${CHART_URL}${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    return mapQuote(symbol, await fetchJson<RawChart>('quotes', url, { headers: HEADERS }));
  } catch (err) {
    const message = errMsg(err);
    if (message.includes('HTTP 404')) return noQuote(symbol, 'unknown symbol');
    if (message.includes('HTTP 429')) return noQuote(symbol, 'rate limited');
    return noQuote(symbol, message);
  }
}

/** One request per symbol, a few at a time. Fails as a whole only when no symbol could be priced. */
export async function fetchQuotes(symbols: string[]): Promise<Quote[]> {
  const quotes = await mapLimit(symbols, 3, fetchQuote);
  const failed = quotes.filter((q) => q.price === null);
  // a typo in one symbol should not hide the others; a total outage should keep the last good prices
  if (failed.length === quotes.length && failed.some((q) => q.error !== 'unknown symbol')) {
    throw new Error(`quotes: ${failed[0]!.error}`);
  }
  return quotes;
}
