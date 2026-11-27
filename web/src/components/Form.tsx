import { Children, cloneElement, isValidElement, useId, useState, type ReactElement, type ReactNode } from 'react';
import type { ConfigIssue, FileConfig } from '@clearview/shared';
import type { SaveFn } from '../lib/api';
import { GLYPH } from '../lib/glyphs';

interface FieldProps {
  label: string;
  hint?: string;
  /** what is wrong with the current value */
  error?: string | null;
  /** the control first, then anything that belongs with it (a datalist, say) */
  children: ReactNode;
}

/** A labelled control. The label names it; the hint and error describe it. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const parts = Children.toArray(children);
  const control = parts[0];
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {isValidElement(control)
        ? cloneElement(control as ReactElement<Record<string, unknown>>, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
        : control}
      {parts.slice(1)}
      {error && (
        <span className="field-error" id={errorId} role="alert">
          {GLYPH.warn} {error}
        </span>
      )}
      {hint && (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  );
}

/** Why a save was refused. */
export function SaveError({ error, issues }: { error: string | null; issues: ConfigIssue[] }) {
  if (!error) return null;
  return (
    <div className="form-errors" role="alert">
      <div>
        {GLYPH.warn} {error}
      </div>
      {issues.map((i) => (
        <div key={`${i.path}${i.message}`} className="c-dim">
          {i.path}: {i.message}
        </div>
      ))}
    </div>
  );
}

export interface Saver {
  busy: boolean;
  error: string | null;
  issues: ConfigIssue[];
  run: (next: FileConfig) => Promise<void>;
}

/** Saves a config and tracks the result. `onDone` runs only when the server accepted it. */
export function useSaver(save: SaveFn, onDone: () => void): Saver {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ConfigIssue[]>([]);

  const run = async (next: FileConfig) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setIssues([]);
    const result = await save(next);
    setBusy(false);
    if (result.ok) {
      onDone();
    } else {
      setError(result.error);
      setIssues(result.issues);
    }
  };
  return { busy, error, issues, run };
}

export function FormActions({ saver, onCancel, saveLabel = 'save changes' }: { saver: Saver; onCancel: () => void; saveLabel?: string }) {
  return (
    <>
      <SaveError error={saver.error} issues={saver.issues} />
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={saver.busy}>
          {saver.busy ? 'saving…' : saveLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          cancel
        </button>
        <span className="c-dim keys-only">
          <kbd>enter</kbd> saves · <kbd>esc</kbd> closes
        </span>
      </div>
    </>
  );
}
