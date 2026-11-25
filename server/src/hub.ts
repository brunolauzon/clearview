import type { ServerResponse } from 'node:http';
import type { Snapshot } from '@clearview/shared';

/** Fan-out of per-topic snapshots to SSE clients. Late joiners get the last value of every topic. */
export class Hub {
  private clients = new Set<ServerResponse>();
  private last = new Map<string, string>();
  private touchers = new Set<() => void>();

  get size(): number {
    return this.clients.size;
  }

  /** Called when a client connects so stale topics can refresh immediately. */
  onConnect(fn: () => void): void {
    this.touchers.add(fn);
  }

  publish(topic: string, payload: unknown): void {
    const msg = frame(topic, payload);
    this.last.set(topic, msg);
    for (const c of this.clients) c.write(msg);
  }

  add(res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    for (const msg of this.last.values()) res.write(msg);
    this.clients.add(res);
    const beat = setInterval(() => res.write(': ping\n\n'), 15_000);
    res.on('close', () => {
      clearInterval(beat);
      this.clients.delete(res);
    });
    for (const fn of this.touchers) fn();
  }
}

function frame(topic: string, payload: unknown): string {
  return `event: ${topic}\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * One polled data source. Polls only while at least one client is connected,
 * keeps the last good data when a refresh fails, and never overlaps runs.
 */
export class Topic<T> {
  last: Snapshot<T> | null = null;
  private running: Promise<void> | null = null;
  private debounce: NodeJS.Timeout | null = null;

  constructor(
    readonly name: string,
    private hub: Hub,
    private intervalMs: number,
    private collect: (() => Promise<T>) | null,
  ) {}

  start(): void {
    if (!this.collect) {
      this.last = { configured: false, ok: true, error: null, at: Date.now(), data: null };
      this.hub.publish(this.name, this.last);
      return;
    }
    setInterval(() => {
      if (this.hub.size > 0) void this.refresh();
    }, this.intervalMs).unref();
    this.hub.onConnect(() => {
      if (!this.last || Date.now() - this.last.at > this.intervalMs) void this.refresh();
    });
  }

  refresh(): Promise<void> {
    if (!this.collect) return Promise.resolve();
    if (this.running) return this.running;
    const collect = this.collect;
    this.running = (async () => {
      try {
        const data = await collect();
        this.last = { configured: true, ok: true, error: null, at: Date.now(), data };
      } catch (err) {
        this.last = {
          configured: true,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          at: Date.now(),
          data: this.last?.data ?? null,
        };
      } finally {
        this.running = null;
      }
      this.hub.publish(this.name, this.last);
    })();
    return this.running;
  }

  /** Coalesce bursts (e.g. many Docker events) into one refresh. */
  refreshSoon(ms = 400): void {
    if (this.debounce || this.hub.size === 0) return;
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.refresh();
    }, ms);
  }

  async get(): Promise<Snapshot<T>> {
    if (!this.last) await this.refresh();
    return this.last!;
  }
}
