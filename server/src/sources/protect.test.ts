import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeEvent, EventLog, mapCameras, mapEvents, ProtectSource, type Connector, type RawCamera } from './protect';
import { HttpStatusError } from './unifi';
import type { FeedHandlers } from './ws';

const cfg = { url: 'https://unifi.local', apiKey: 'secret-key', site: null, insecure: true };
const cameras: RawCamera[] = [
  { id: 'b', name: 'Driveway', type: 'UVC G6 Turret', state: 'CONNECTED', smartDetectSettings: { objectTypes: ['person', 'licensePlate'] } },
  { id: 'a', name: null, type: 'UVC G5 Flex', state: 'DISCONNECTED' },
];
const msg = (type: 'add' | 'update', item: object) => JSON.stringify({ type, item: { modelKey: 'event', ...item } });

describe('describeEvent', () => {
  it('names what was detected, and tells plain motion apart', () => {
    expect(describeEvent({ id: '1', type: 'smartDetectZone', smartDetectTypes: ['person', 'licensePlate'] })).toEqual({ what: 'person, license plate', motionOnly: false });
    expect(describeEvent({ id: '1', type: 'smartDetectLine', smartDetectTypes: [] })).toEqual({ what: 'detection', motionOnly: false });
    expect(describeEvent({ id: '1', type: 'smartAudioDetect', smartDetectTypes: ['alrmBabyCry'] })?.what).toBe('baby crying');
    expect(describeEvent({ id: '1', type: 'ring' })?.what).toBe('doorbell');
    expect(describeEvent({ id: '1', type: 'motion' })).toEqual({ what: 'motion', motionOnly: true });
    expect(describeEvent({ id: '1', type: 'sensorWaterLeak' })).toBeNull();
  });
});

describe('EventLog', () => {
  it('adds events and merges partial updates', () => {
    const log = new EventLog();
    log.apply(msg('add', { id: '1', type: 'smartDetectZone', start: 100, device: 'b', smartDetectTypes: [] }));
    log.apply(msg('update', { id: '1', end: 200, smartDetectTypes: ['vehicle'] }));
    expect(log.newestFirst()).toEqual([expect.objectContaining({ id: '1', start: 100, end: 200, device: 'b', smartDetectTypes: ['vehicle'] })]);
  });

  it('ignores anything that is not a shown event', () => {
    const log = new EventLog();
    for (const text of ['nonsense', 'null', '{}', msg('add', { id: '2' }), msg('add', { id: '3', type: 'nfcCardScanned', start: 1, device: 'b' })]) log.apply(text);
    log.apply(msg('update', { id: 'unseen', end: 5 })); // the end of something that began before we listened
    expect(log.newestFirst()).toEqual([]);
  });

  it('keeps only the newest', () => {
    const log = new EventLog(2);
    for (const start of [20, 10, 30]) log.apply(msg('add', { id: String(start), type: 'motion', start, device: 'b' }));
    expect(log.newestFirst().map((e) => e.id)).toEqual(['30', '20']);
  });
});

describe('mapCameras and mapEvents', () => {
  it('sorts cameras by name, falling back to the model, and drops events of unknown cameras', () => {
    const mapped = mapCameras(cameras);
    expect(mapped.map((c) => [c.name, c.state])).toEqual([
      ['Driveway', 'connected'],
      ['UVC G5 Flex', 'disconnected'],
    ]);
    expect(mapped[0]!.detects).toEqual(['person', 'license plate']);
    const events = mapEvents(
      [
        { id: '1', type: 'motion', start: 5, device: 'b' },
        { id: '2', type: 'motion', start: 4, device: 'gone' },
      ],
      mapped,
    );
    expect(events).toEqual([{ id: '1', cameraId: 'b', camera: 'Driveway', what: 'motion', motionOnly: true, start: 5, end: null }]);
  });
});

describe('ProtectSource', () => {
  afterEach(() => vi.useRealTimers());

  function fakeFeed() {
    const opened: { url: string; key: string | undefined; handlers: FeedHandlers }[] = [];
    const connect: Connector = (url, options, handlers) => {
      opened.push({ url, key: options.headers['X-API-KEY'], handlers });
      return { close: () => undefined };
    };
    return { opened, connect };
  }

  it('lists cameras, follows the feed once and reconnects when it drops', async () => {
    vi.useFakeTimers();
    const feed = fakeFeed();
    const paths: string[] = [];
    const source = new ProtectSource(cfg, async (p) => (paths.push(p), cameras), feed.connect);

    expect(await source.collect()).toMatchObject({ available: true, live: false, since: null, events: [] });
    const first = feed.opened[0]!;
    expect(first.url).toBe('https://unifi.local/proxy/protect/integration/v1/subscribe/events');
    expect(first.key).toBe('secret-key');

    first.handlers.onOpen();
    first.handlers.onMessage(msg('add', { id: '1', type: 'ring', start: 50, device: 'b' }));
    const seen = await source.collect();
    expect(seen).toMatchObject({ live: true, feedError: null });
    expect(seen.events[0]).toMatchObject({ camera: 'Driveway', what: 'doorbell' });
    expect(feed.opened).toHaveLength(1);
    expect(paths).toHaveLength(1); // the camera list is cached

    first.handlers.onClose('connection closed');
    const dropped = await source.collect();
    expect(dropped).toMatchObject({ live: false, feedError: 'connection closed' });
    expect(dropped.events).toHaveLength(1);
    expect(feed.opened).toHaveLength(1); // waiting before the next try
    vi.advanceTimersByTime(5_000);
    expect(feed.opened).toHaveLength(2);
  });

  it('reports a console without Protect as unavailable and never opens the feed', async () => {
    const feed = fakeFeed();
    const source = new ProtectSource(cfg, async () => Promise.reject(new HttpStatusError('protect: HTTP 404', 404)), feed.connect);
    expect(await source.collect()).toMatchObject({ available: false, cameras: [] });
    expect(feed.opened).toHaveLength(0);
  });

  it('passes other failures on', async () => {
    const source = new ProtectSource(cfg, async () => Promise.reject(new HttpStatusError('protect: auth failed (HTTP 401), check the API key', 401)), fakeFeed().connect);
    await expect(source.collect()).rejects.toThrow(/auth failed/);
  });
});
