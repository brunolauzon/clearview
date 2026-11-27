import { GLYPH } from '../lib/glyphs';

export type ToastTone = 'ok' | 'err' | 'info';

export interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

const MARK: Record<ToastTone, string> = { ok: GLYPH.check, err: GLYPH.warn, info: '>' };

/** Short feedback above the status bar. The live region stays mounted so screen readers hear each message. */
export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toast && (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          <span aria-hidden>{MARK[toast.tone]}</span>
          <span className="toast-text">{toast.text}</span>
          <button type="button" className="icon-btn" aria-label="dismiss message" onClick={onDismiss}>
            {GLYPH.close}
          </button>
        </div>
      )}
    </div>
  );
}
