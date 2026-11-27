import { useEffect, useRef } from 'react';
import { VIEWS, type ViewId } from '../lib/commands';
import { revealInRow } from '../lib/scroll';

export interface NavBadge {
  count: number;
  tone: 'err' | 'warn' | 'accent';
  /** what the number counts */
  label: string;
}

/** Settings and help sit apart from the views that show data. */
const END: ViewId[] = ['config', 'help'];
const ORDER = [...VIEWS.filter((v) => !END.includes(v.id)), ...END.map((id) => VIEWS.find((v) => v.id === id)!)];

interface NavProps {
  view: ViewId;
  badges: Partial<Record<ViewId, NavBadge>>;
  onNavigate: (view: ViewId) => void;
}

/** Every view, on every screen size, with its number key. */
export function Nav({ view, badges, onNavigate }: NavProps) {
  const list = useRef<HTMLUListElement>(null);

  // on a narrow screen the bar scrolls sideways: keep the current view in sight
  useEffect(() => {
    revealInRow(list.current, list.current?.querySelector<HTMLElement>('[aria-current]'), 40);
  }, [view]);

  return (
    <nav className="nav" aria-label="views">
      <ul ref={list}>
        {ORDER.map((v) => {
          const badge = badges[v.id];
          return (
            <li key={v.id} className={v.id === END[0] ? 'nav-end' : undefined}>
              <a
                href={`#${v.id}`}
                aria-current={view === v.id ? 'page' : undefined}
                title={v.about}
                onClick={(e) => {
                  // leave new-tab clicks to the browser
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onNavigate(v.id);
                }}
              >
                <kbd aria-hidden>{v.key ?? '?'}</kbd>
                {v.id}
                {badge && (
                  <span className={`nav-badge ${badge.tone}`} title={`${badge.count} ${badge.label}`}>
                    <span aria-hidden>{badge.count}</span>
                    <span className="sr-only">
                      , {badge.count} {badge.label}
                    </span>
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
