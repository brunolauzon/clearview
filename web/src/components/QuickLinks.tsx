import type { LinkInfo } from '@clearview/shared';
import type { ViewId } from '../lib/commands';
import type { ShortcutEntry } from '../lib/configEdit';
import { siteName } from '../lib/format';
import { GLYPH } from '../lib/glyphs';

/** how many of each kind the header has room for */
const MAX = 10;

interface QuickLinksProps {
  links: LinkInfo[];
  shortcuts: ShortcutEntry[];
  onNavigate: (view: ViewId) => void;
  onEditShortcuts: () => void;
}

const status = (l: LinkInfo) => (l.up === null ? 'not checked' : l.up ? 'up' : 'down');

/** The user's own links and letter shortcuts, one click away on every page. */
export function QuickLinks({ links, shortcuts, onNavigate, onEditShortcuts }: QuickLinksProps) {
  if (links.length === 0 && shortcuts.length === 0) return null;
  return (
    <nav className="quick" aria-label="your links">
      <ul>
        {links.slice(0, MAX).map((l) => (
          <li key={l.url + l.name}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" title={`${l.url} (${status(l)})`}>
              <span className={l.up === null ? 'c-dim' : l.up ? 'c-ok' : 'c-err'} aria-hidden>
                {GLYPH.dot}
              </span>
              <span className={`quick-name${l.up === false ? ' c-err' : ''}`}>{l.name}</span>
              <span className="sr-only">, {status(l)}</span>
            </a>
          </li>
        ))}
        {links.length > MAX && (
          <li>
            <button type="button" className="text-btn" onClick={() => onNavigate('links')}>
              +{links.length - MAX} more links
            </button>
          </li>
        )}
        {shortcuts.slice(0, MAX).map((s) => (
          <li key={`key-${s.key}`}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" title={`${s.url} (press ${s.key})`}>
              <kbd className="cap">{s.key}</kbd>
              <span className="quick-name">{siteName(s.url)}</span>
            </a>
          </li>
        ))}
        {shortcuts.length > MAX && (
          <li>
            <button type="button" className="text-btn" onClick={onEditShortcuts}>
              +{shortcuts.length - MAX} more shortcuts
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}
