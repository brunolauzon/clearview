import { useEffect, useState } from 'react';
import type {
  AlertInfo,
  ConfigState,
  ContainerInfo,
  ContainerStats,
  HostStats,
  LinkInfo,
  Meta,
  PlexData,
  ProtectData,
  Quote,
  Snapshot,
  TorrentData,
  UnifiData,
  WeatherData,
} from '@clearview/shared';

export interface StreamState {
  connected: boolean;
  /** epoch ms of the last message from the server; null until the first one */
  lastAt: number | null;
  meta: Meta | null;
  config: ConfigState | null;
  host: Snapshot<HostStats> | null;
  containers: Snapshot<ContainerInfo[]> | null;
  stats: Snapshot<Record<string, ContainerStats>> | null;
  plex: Snapshot<PlexData> | null;
  alerts: Snapshot<AlertInfo[]> | null;
  links: Snapshot<LinkInfo[]> | null;
  weather: Snapshot<WeatherData> | null;
  quotes: Snapshot<Quote[]> | null;
  unifi: Snapshot<UnifiData> | null;
  torrents: Snapshot<TorrentData> | null;
  protect: Snapshot<ProtectData> | null;
}

const TOPICS = ['meta', 'config', 'host', 'containers', 'stats', 'plex', 'alerts', 'links', 'weather', 'quotes', 'unifi', 'torrents', 'protect'] as const;

const initial: StreamState = {
  connected: false,
  lastAt: null,
  meta: null,
  config: null,
  host: null,
  containers: null,
  stats: null,
  plex: null,
  alerts: null,
  links: null,
  weather: null,
  quotes: null,
  unifi: null,
  torrents: null,
  protect: null,
};

/** how long to wait before dialling again when the browser has given up */
const RETRY_MS = 5000;
/** the server sends something every few seconds; silence this long means the connection is dead */
const SILENT_MS = 20_000;

/**
 * One EventSource for the whole app; the server replays the latest value of every topic on connect.
 * The browser reconnects on its own after a dropped connection, with two exceptions handled here: it
 * gives up for good if answered with an error (a reverse proxy while the container restarts), and it
 * cannot tell when a proxy holds a dead connection open.
 */
export function useStream(): StreamState {
  const [state, setState] = useState<StreamState>(initial);

  useEffect(() => {
    let es: EventSource;
    let retry: number | undefined;
    let heard = Date.now();
    const lost = () => setState((s) => ({ ...s, connected: false }));
    const connect = () => {
      window.clearTimeout(retry);
      heard = Date.now();
      es = new EventSource('/api/stream');
      es.onerror = () => {
        lost();
        if (es.readyState === EventSource.CLOSED) {
          window.clearTimeout(retry);
          retry = window.setTimeout(connect, RETRY_MS);
        }
      };
      for (const topic of TOPICS) {
        es.addEventListener(topic, (e) => {
          const data = JSON.parse((e as MessageEvent<string>).data);
          heard = Date.now();
          // only data proves the connection works; an open socket alone does not
          setState((s) => ({ ...s, connected: true, lastAt: heard, [topic]: data }));
        });
      }
    };
    connect();
    const watchdog = window.setInterval(() => {
      if (Date.now() - heard < SILENT_MS) return;
      lost();
      es.close();
      connect();
    }, RETRY_MS);
    return () => {
      window.clearTimeout(retry);
      window.clearInterval(watchdog);
      es.close();
    };
  }, []);

  return state;
}
