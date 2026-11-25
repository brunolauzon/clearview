/**
 * GET JSON with a timeout and error messages that never include the URL
 * (Tautulli puts its API key in the query string).
 */
export async function fetchJson<T>(label: string, url: string, init: RequestInit = {}, timeoutMs = 5000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    if (e.name === 'TimeoutError') throw new Error(`${label}: timed out after ${timeoutMs / 1000}s`);
    const code = e.cause?.code;
    throw new Error(`${label}: cannot connect${code ? ` (${code})` : ''}`);
  }
  if (res.status === 401 || res.status === 403) throw new Error(`${label}: auth failed (HTTP ${res.status}), check the token or API key`);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`${label}: response was not JSON, check the URL`);
  }
}
