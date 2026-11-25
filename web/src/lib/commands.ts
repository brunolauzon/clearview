export type ViewId = 'home' | 'containers' | 'plex' | 'alerts' | 'disks' | 'links' | 'help';

export interface ViewDef {
  id: ViewId;
  /** digit key that jumps here; null for help (`?`) */
  key: string | null;
  aliases: string[];
}

export const VIEWS: ViewDef[] = [
  { id: 'home', key: '1', aliases: ['h', 'dash', 'q', 'quit'] },
  { id: 'containers', key: '2', aliases: ['c', 'ctr', 'docker', 'pods'] },
  { id: 'plex', key: '3', aliases: ['p', 'tautulli', 'streams'] },
  { id: 'alerts', key: '4', aliases: ['a', 'grafana'] },
  { id: 'disks', key: '5', aliases: ['d', 'disk', 'df'] },
  { id: 'links', key: '6', aliases: ['l', 'net', 'network'] },
  { id: 'help', key: null, aliases: ['?'] },
];

/** Resolve text typed after `:` to a view. Exact name or alias first, then a unique prefix. */
export function parseCommand(input: string): ViewId | null {
  const s = input.trim().replace(/^:/, '').toLowerCase();
  if (!s) return null;
  const exact = VIEWS.find((v) => v.id === s || v.aliases.includes(s));
  if (exact) return exact.id;
  const prefixed = VIEWS.filter((v) => v.id.startsWith(s));
  return prefixed.length === 1 ? prefixed[0]!.id : null;
}

/** Ghost text to complete the current input, k9s-style. Tab accepts it. */
export function suggest(input: string): string {
  const s = input.trim().toLowerCase();
  if (!s) return '';
  const match = VIEWS.find((v) => v.id.startsWith(s) && v.id !== s);
  return match ? match.id.slice(s.length) : '';
}

export function viewFromHash(hash: string): ViewId {
  const id = hash.replace(/^#/, '');
  return VIEWS.some((v) => v.id === id) ? (id as ViewId) : 'home';
}
