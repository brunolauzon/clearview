// Letter shortcuts that open a website. Used by the server to validate the config and by the web
// app for its form and key handling.

/** Letters the dashboard already uses in some view, with what they do there. */
export const RESERVED_KEYS: Record<string, string> = {
  a: 'add, in the config view',
  d: 'delete, in the config view',
  e: 'edit',
  g: 'jump to top or bottom',
  i: 'edit the yaml, in the config view',
  j: 'move down',
  k: 'move up',
  o: 'open',
  s: 'sort containers',
};

/** Why a key cannot be a shortcut, or null when it can. */
export function shortcutKeyError(key: string): string | null {
  if (!/^[a-zA-Z]$/.test(key)) return 'a shortcut key is a single letter, a to z';
  const use = RESERVED_KEYS[key.toLowerCase()];
  return use ? `"${key.toLowerCase()}" is already used by the dashboard (${use})` : null;
}

/** Only web pages: a `javascript:` or `file:` address is refused. */
export const isWebAddress = (url: string): boolean => /^https?:\/\/[^\s/]+\S*$/i.test(url);
