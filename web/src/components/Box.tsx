import type { ReactNode } from 'react';
import { GLYPH } from '../lib/glyphs';

interface BoxProps {
  title: string;
  /** shown in parens after the title, k9s style: containers(all)[23] */
  hint?: string;
  count?: number;
  className?: string;
  /** makes the title a button that opens the full view */
  onOpen?: () => void;
  children: ReactNode;
}

/** Bordered panel with the title set into the top border. */
export function Box({ title, hint, count, className = '', onOpen, children }: BoxProps) {
  const label = (
    <>
      <span className="t-name">{title}</span>
      {hint !== undefined && <span className="t-hint">({hint})</span>}
      {count !== undefined && <span className="t-count">[{count}]</span>}
    </>
  );
  return (
    <section className={`box ${className}`}>
      <h2 className="box-title">
        {onOpen ? (
          <button type="button" className="box-open" onClick={onOpen} title={`open ${title}`}>
            {label}
            <span className="c-dim" aria-hidden>
              {' ›'}
            </span>
          </button>
        ) : (
          label
        )}
      </h2>
      <div className="box-body">{children}</div>
    </section>
  );
}

/** One-line message used for setup, empty and error states. */
export function Note({ tone = 'dim', children }: { tone?: 'dim' | 'err' | 'warn' | 'ok'; children: ReactNode }) {
  return (
    <div className={`note c-${tone}`} role={tone === 'err' ? 'alert' : undefined}>
      {tone === 'err' || tone === 'warn' ? `${GLYPH.warn} ` : null}
      {children}
    </div>
  );
}

/** An empty list, with the way out of it when there is one. */
export function Empty({ tone = 'dim', action, onAction, children }: { tone?: 'dim' | 'ok'; action?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <div className="empty">
      <span className={`c-${tone}`}>{children}</span>
      {action && onAction && (
        <button type="button" className="btn" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

/** Placeholder lines while the first data is on its way. */
export function Loading({ what, lines = 3 }: { what: string; lines?: number }) {
  return (
    <div className="loading" role="status">
      <span className="sr-only">loading {what}…</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton" aria-hidden />
      ))}
    </div>
  );
}
