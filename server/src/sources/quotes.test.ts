import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchQuotes, mapQuote } from './quotes';

// shape taken from a real chart response
const chart = (meta: Record<string, unknown>) => ({ chart: { result: [{ meta }] } });
const aapl = chart({ symbol: 'AAPL', shortName: 'Apple Inc.', currency: 'USD', regularMarketPrice: 355.58, chartPreviousClose: 354.07 });

describe('mapQuote', () => {
  it('computes today’s change against the previous close', () => {
    const q = mapQuote('AAPL', aapl);
    expect(q).toMatchObject({ symbol: 'AAPL', name: 'Apple Inc.', price: 355.58, currency: 'USD', error: null });
    expect(q.change).toBeCloseTo(1.51, 5);
    expect(q.changePct).toBeCloseTo(0.42647, 4);
  });

  it('reports a fall as negative', () => {
    const q = mapQuote('X', chart({ regularMarketPrice: 90, chartPreviousClose: 100 }));
    expect(q.change).toBe(-10);
    expect(q.changePct).toBe(-10);
  });

  it('uses previousClose as a fallback, and no change when neither is usable', () => {
    expect(mapQuote('X', chart({ regularMarketPrice: 11, previousClose: 10 })).change).toBe(1);
    expect(mapQuote('X', chart({ regularMarketPrice: 11 }))).toMatchObject({ price: 11, change: null, changePct: null });
    expect(mapQuote('X', chart({ regularMarketPrice: 11, chartPreviousClose: 0 })).changePct).toBeNull();
  });

  it('marks a response without a price', () => {
    expect(mapQuote('X', { chart: { result: null } })).toMatchObject({ price: null, error: 'no price' });
    expect(mapQuote('X', chart({}))).toMatchObject({ price: null, error: 'no price' });
  });
});

describe('fetchQuotes', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(byStatus: (symbol: string) => number) {
    const seen: { url: string; agent: string | undefined }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      seen.push({ url, agent: (init?.headers as Record<string, string>)?.['User-Agent'] });
      const symbol = decodeURIComponent(new URL(url).pathname.split('/').pop()!);
      const status = byStatus(symbol);
      return new Response(JSON.stringify(status === 200 ? aapl : {}), { status });
    });
    return seen;
  }

  it('keeps the order, encodes symbols and sends a browser-like User-Agent', async () => {
    const seen = stub(() => 200);
    const out = await fetchQuotes(['^GSPC', 'AAPL']);
    expect(out.map((q) => q.symbol)).toEqual(['^GSPC', 'AAPL']);
    expect(seen.some((s) => s.url.includes('/%5EGSPC?'))).toBe(true);
    expect(seen[0]!.agent).toMatch(/^Mozilla\/5\.0/);
  });

  it('shows the others when one symbol is unknown', async () => {
    stub((s) => (s === 'TYPO' ? 404 : 200));
    const out = await fetchQuotes(['AAPL', 'TYPO']);
    expect(out[0]!.price).toBe(355.58);
    expect(out[1]).toMatchObject({ price: null, error: 'unknown symbol' });
  });

  it('fails as a whole during an outage, so the last good prices are kept', async () => {
    stub(() => 429);
    await expect(fetchQuotes(['AAPL', 'MSFT'])).rejects.toThrow(/rate limited/);
  });

  it('does not treat all-unknown symbols as an outage', async () => {
    stub(() => 404);
    const out = await fetchQuotes(['NOPE']);
    expect(out[0]).toMatchObject({ error: 'unknown symbol' });
  });
});
