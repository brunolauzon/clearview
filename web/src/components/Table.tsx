import { useEffect, useRef, type ReactNode } from 'react';
import { BUCKET_ORDER, useBucket, type Bucket } from '../hooks/useBucket';

export interface Column<T> {
  id: string;
  title: string;
  /** CSS grid track, e.g. "2fr", "12ch", "minmax(10ch, 1fr)" */
  width: string;
  align?: 'right';
  /** smallest viewport bucket where this column is shown; default always */
  min?: Bucket;
  render: (row: T) => ReactNode;
}

interface TableProps<T> {
  cols: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** selected row index; -1 for a read-only table */
  sel?: number;
  onSelect?: (index: number) => void;
  /** rows with a link render as <a> so click, middle-click and ctrl-click all work */
  href?: (row: T) => string | null;
  sortId?: string;
  empty?: ReactNode;
}

export function Table<T>({ cols, rows, rowKey, sel = -1, onSelect, href, sortId, empty }: TableProps<T>) {
  const bucket = useBucket();
  const visible = cols.filter((c) => BUCKET_ORDER[c.min ?? 'sm'] <= BUCKET_ORDER[bucket]);
  const template = visible.map((c) => c.width).join(' ');
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (sel >= 0) refs.current[sel]?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  return (
    <div className="table" role="table">
      <div className="thead" role="row" style={{ gridTemplateColumns: template }}>
        {visible.map((c) => (
          <div key={c.id} role="columnheader" className={`cell${c.align === 'right' ? ' right' : ''}`}>
            {c.title}
            {sortId === c.id ? <span className="sort"> ↑</span> : null}
          </div>
        ))}
      </div>
      {rows.length === 0 && empty}
      {rows.map((row, i) => {
        const link = href?.(row) ?? null;
        const props = {
          className: `row${i === sel ? ' sel' : ''}${link ? ' link' : ''}`,
          style: { gridTemplateColumns: template },
          onClick: () => onSelect?.(i),
          ref: (el: HTMLElement | null) => {
            refs.current[i] = el;
          },
          role: 'row',
        };
        const cells = visible.map((c) => (
          <div key={c.id} role="cell" className={`cell${c.align === 'right' ? ' right' : ''}`}>
            {c.render(row)}
          </div>
        ));
        return link ? (
          <a key={rowKey(row)} {...props} href={link} target="_blank" rel="noopener noreferrer" tabIndex={-1}>
            {cells}
          </a>
        ) : (
          <div key={rowKey(row)} {...props}>
            {cells}
          </div>
        );
      })}
    </div>
  );
}
