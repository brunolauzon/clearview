import { Fragment, useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { BUCKET_ORDER, useBucket, useMedia, type Bucket } from '../hooks/useBucket';

export interface Column<T> {
  id: string;
  title: string;
  /** CSS grid track, e.g. "2fr", "12ch", "minmax(10ch, 1fr)" */
  width: string;
  align?: 'right';
  /** grid track on a phone, where `width` would be too generous */
  narrow?: string;
  /** smallest viewport bucket where this column is shown; default always */
  min?: Bucket;
  /** this cell names the row and carries its link; default the first column */
  primary?: boolean;
  /** let long text run onto more lines instead of cutting it off */
  wrap?: boolean;
  /** clicking the header sorts by this column (needs `onSort`) */
  sortable?: boolean;
  render: (row: T) => ReactNode;
}

interface RowAction<T> {
  /** short button text */
  label: string;
  /** what the button does for this row, for screen readers */
  describe: (row: T) => string;
  run: (row: T) => void;
}

interface TableProps<T> {
  /** what the table lists, for screen readers */
  label: string;
  cols: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** selected row index; -1 for a read-only table */
  sel?: number;
  onSelect?: (index: number) => void;
  /** a row with a link is clickable all over, and middle-click and ctrl-click work */
  href?: (row: T) => string | null;
  /** double click on a row that has no link */
  onActivate?: (index: number) => void;
  /** a button at the end of every row */
  action?: RowAction<T>;
  /** keep the selection visible on touch screens, where buttons outside the table act on it */
  pinned?: boolean;
  sortId?: string;
  /** show ↓ instead of ↑ on the sorted column */
  sortDesc?: boolean;
  onSort?: (id: string) => void;
  /**
   * Draws a heading row (name and size) whenever this changes between neighbouring rows, so rows
   * must already be sorted by it. Headings are not rows: selection indexes ignore them.
   */
  groupOf?: (row: T) => string;
  empty?: ReactNode;
}

/** Cut-off cells say what they hold when the pointer rests on their row. */
function revealCut(e: MouseEvent<HTMLElement>) {
  const row = e.currentTarget;
  const cut = [...row.querySelectorAll<HTMLElement>('.cell')].filter((c) => c.scrollWidth > c.clientWidth).map((c) => c.textContent);
  (row.querySelector<HTMLElement>('.row-link') ?? row).title = cut.join(' · ');
}

export function Table<T>({
  label,
  cols,
  rows,
  rowKey,
  sel = -1,
  onSelect,
  href,
  onActivate,
  action,
  pinned,
  sortId,
  sortDesc,
  onSort,
  groupOf,
  empty,
}: TableProps<T>) {
  const bucket = useBucket();
  // with nothing to hover there is no keyboard cursor to show, only a row that looks stuck on
  const touch = useMedia('(hover: none)');
  const visible = cols.filter((c) => BUCKET_ORDER[c.min ?? 'sm'] <= BUCKET_ORDER[bucket]);
  // on a phone, flexible columns give way (and cut their text) instead of pushing the page sideways
  const phone = bucket === 'sm';
  const widths = visible.map((c) => (phone ? (c.narrow ?? c.width.replace(/^minmax\([^,]+,/, 'minmax(0,')) : c.width));
  const template = [...widths, ...(action ? [phone ? '4ch' : '6ch'] : [])].join(' ');
  const primary = (visible.find((c) => c.primary) ?? visible[0])?.id;
  const root = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const lastSel = useRef(sel);

  // follow the cursor when it moves (not on the first paint, which would scroll a phone past the header)
  useEffect(() => {
    if (lastSel.current === sel) return;
    lastSel.current = sel;
    const row = refs.current[sel];
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    // keyboard focus moves with the cursor while it is inside this table
    const active = document.activeElement;
    if (active && root.current?.contains(active) && !row.contains(active)) {
      (row.querySelector<HTMLElement>('.row-link') ?? row).focus({ preventScroll: true });
    }
  }, [sel]);

  if (rows.length === 0 && empty) return <>{empty}</>;

  const groupSizes = new Map<string, number>();
  if (groupOf) for (const row of rows) groupSizes.set(groupOf(row), (groupSizes.get(groupOf(row)) ?? 0) + 1);
  const cellClass = (c: Column<T>) => `cell${c.align === 'right' ? ' right' : ''}${c.wrap ? ' wrap' : ''}`;
  const selectable = sel >= 0 && onSelect !== undefined;

  return (
    <div className="table" role="table" aria-label={label} ref={root}>
      <div className="thead" role="row" style={{ gridTemplateColumns: template }}>
        {visible.map((c) => {
          const sorted = sortId === c.id;
          const arrow = sorted ? (sortDesc ? ' ↓' : ' ↑') : '';
          return (
            <div key={c.id} role="columnheader" className={cellClass(c)} aria-sort={sorted ? (sortDesc ? 'descending' : 'ascending') : undefined}>
              {c.sortable && onSort ? (
                <button type="button" className="th-sort" onClick={() => onSort(c.id)} title={`sort by ${c.title}`}>
                  {c.title}
                  <span aria-hidden>{arrow}</span>
                </button>
              ) : (
                `${c.title}${arrow}`
              )}
            </div>
          );
        })}
        {action && (
          <div role="columnheader" className="cell">
            <span className="sr-only">actions</span>
          </div>
        )}
      </div>
      {rows.map((row, i) => {
        const link = href?.(row) ?? null;
        const group = groupOf?.(row);
        const startsGroup = groupOf !== undefined && (i === 0 || groupOf(rows[i - 1]!) !== group);
        const isSel = i === sel;
        const marked = isSel && (pinned || !touch);
        // one Tab stop per table: the selected row; j, k and the arrows move within it
        const tabIndex = !selectable || isSel ? 0 : -1;
        return (
          <Fragment key={rowKey(row)}>
            {startsGroup && group !== undefined && (
              <div className="group-row" role="presentation">
                <span className="group-name">{group}</span>
                <span className="group-count">{groupSizes.get(group)}</span>
              </div>
            )}
            <div
              role="row"
              className={`row${marked ? ' sel' : ''}${link ? ' link' : ''}`}
              style={{ gridTemplateColumns: template }}
              ref={(el) => {
                refs.current[i] = el;
              }}
              aria-current={isSel ? 'true' : undefined}
              tabIndex={selectable && !link ? tabIndex : undefined}
              onClick={() => onSelect?.(i)}
              onDoubleClick={!link && onActivate ? () => onActivate(i) : undefined}
              onFocus={() => {
                if (!isSel) onSelect?.(i);
              }}
              onMouseEnter={revealCut}
            >
              {visible.map((c) => (
                <div key={c.id} role="cell" className={cellClass(c)}>
                  {link && c.id === primary ? (
                    <a className="row-link" href={link} target="_blank" rel="noopener noreferrer" tabIndex={tabIndex}>
                      {c.render(row)}
                    </a>
                  ) : (
                    c.render(row)
                  )}
                </div>
              ))}
              {action && (
                <div role="cell" className="cell act">
                  <button
                    type="button"
                    className="row-action"
                    tabIndex={tabIndex}
                    aria-label={action.describe(row)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect?.(i);
                      action.run(row);
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    {action.label}
                  </button>
                </div>
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
