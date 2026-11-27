export type ViewId = 'home' | 'containers' | 'plex' | 'alerts' | 'disks' | 'links' | 'config' | 'cameras' | 'help';

export interface ViewDef {
  id: ViewId;
  /** digit key that jumps here; null for help (`?`) */
  key: string | null;
  aliases: string[];
  /** one line on what it shows */
  about: string;
}

export const VIEWS: ViewDef[] = [
  { id: 'home', key: '1', aliases: ['h', 'dash', 'q', 'quit'], about: 'overview' },
  { id: 'containers', key: '2', aliases: ['c', 'ctr', 'docker', 'pods'], about: 'Docker containers' },
  { id: 'plex', key: '3', aliases: ['p', 'tautulli', 'streams'], about: 'streams and library stats' },
  { id: 'alerts', key: '4', aliases: ['a', 'grafana'], about: 'Grafana alerts' },
  { id: 'disks', key: '5', aliases: ['d', 'disk', 'df'], about: 'array, cache and pool usage' },
  { id: 'links', key: '6', aliases: ['l', 'net', 'network'], about: 'other devices on your network' },
  { id: 'config', key: '7', aliases: ['cfg', 'conf', 'settings', 'edit'], about: 'settings' },
  { id: 'cameras', key: '8', aliases: ['cam', 'cams', 'protect', 'nvr'], about: 'UniFi Protect cameras and events' },
  { id: 'help', key: null, aliases: ['?'], about: 'keys and tips' },
];

/**
 * The views offered under the command prompt, best first: the one Enter would open for exactly this
 * text, then names starting with it, then aliases starting with it. Everything for an empty prompt.
 */
export function matchViews(input: string): ViewDef[] {
  const s = input.trim().replace(/^:/, '').toLowerCase();
  if (!s) return VIEWS;
  const rank = (v: ViewDef) => (v.id === s || v.aliases.includes(s) ? 0 : v.id.startsWith(s) ? 1 : v.aliases.some((a) => a.startsWith(s)) ? 2 : 3);
  return VIEWS.filter((v) => rank(v) < 3).sort((a, b) => rank(a) - rank(b));
}

export function viewFromHash(hash: string): ViewId {
  const id = hash.replace(/^#/, '');
  return VIEWS.some((v) => v.id === id) ? (id as ViewId) : 'home';
}
