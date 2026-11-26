import { useState, type ReactNode } from 'react';
import type { ConfigIssue, FileConfig } from '@clearview/shared';
import type { SaveFn } from '../lib/api';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
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

export function FormActions({ saver, onCancel, saveLabel = 'save' }: { saver: Saver; onCancel: () => void; saveLabel?: string }) {
  return (
    <>
      {saver.error && (
        <div className="form-errors" role="alert">
          <div>⚠ {saver.error}</div>
          {saver.issues.map((i) => (
            <div key={`${i.path}${i.message}`} className="c-dim">
              {i.path}: {i.message}
            </div>
          ))}
        </div>
      )}
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={saver.busy}>
          {saver.busy ? 'saving…' : saveLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          cancel
        </button>
        <span className="c-faint">esc cancels</span>
      </div>
    </>
  );
}
