import type { ReactNode } from 'react';

interface BoxProps {
  title: string;
  /** shown in parens after the title, k9s style: containers(all)[23] */
  hint?: string;
  count?: number;
  className?: string;
  children: ReactNode;
}

/** Bordered panel with the title set into the top border. */
export function Box({ title, hint, count, className = '', children }: BoxProps) {
  return (
    <section className={`box ${className}`}>
      <h2 className="box-title">
        <span className="t-name">{title}</span>
        {hint !== undefined && <span className="t-hint">({hint})</span>}
        {count !== undefined && <span className="t-count">[{count}]</span>}
      </h2>
      <div className="box-body">{children}</div>
    </section>
  );
}

/** One-line message used for loading, empty and error states. */
export function Note({ tone = 'dim', children }: { tone?: 'dim' | 'err' | 'warn' | 'ok'; children: ReactNode }) {
  return <div className={`note c-${tone}`}>{children}</div>;
}
