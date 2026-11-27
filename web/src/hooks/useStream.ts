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

/** One EventSource for the whole app. The browser reconnects on its own; the server replays the latest value of every topic. */
export function useStream(): StreamState {
  const [state, setState] = useState<StreamState>(initial);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onopen = () => setState((s) => ({ ...s, connected: true }));
    es.onerror = () => setState((s) => ({ ...s, connected: false }));
    for (const topic of TOPICS) {
      es.addEventListener(topic, (e) => {
        const data = JSON.parse((e as MessageEvent<string>).data);
        setState((s) => ({ ...s, connected: true, [topic]: data }));
      });
    }
    return () => es.close();
  }, []);

  return state;
}
