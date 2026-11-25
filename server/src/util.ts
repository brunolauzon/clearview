/** Run `fn` over `items` with at most `limit` in flight. Order of results matches input. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Strip secrets like `apikey=...` from text before it reaches logs or the UI. */
export function redact(text: string): string {
  return text.replace(/(apikey|api_key|token)=[^&\s]+/gi, '$1=***');
}

export function errMsg(err: unknown): string {
  return redact(err instanceof Error ? err.message : String(err));
}
