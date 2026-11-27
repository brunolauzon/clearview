import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { GLYPH } from '../lib/glyphs';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  title: string;
  onClose: () => void;
  /** there is typed input to lose: Esc, the close button and a click outside ask first */
  dirty?: boolean;
  children: ReactNode;
}

/**
 * Centered box over a dimmed page. Focus starts inside, stays inside, and returns where it came from.
 * Esc, the close button, a click outside and the back button all close it.
 */
export function Modal({ title, onClose, dirty = false, children }: ModalProps) {
  const root = useRef<HTMLElement>(null);
  const titleId = useId();
  const [asking, setAsking] = useState(false);
  // the page re-renders every couple of seconds as data streams in: keep one stable listener
  // and never re-focus, or the cursor would jump out of the field being typed in
  const latest = useRef({ onClose, dirty, asking });
  latest.current = { onClose, dirty, asking };

  const request = () => {
    if (latest.current.dirty) setAsking(true);
    else latest.current.onClose();
  };
  const requestRef = useRef(request);
  requestRef.current = request;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (latest.current.asking) setAsking(false);
        else requestRef.current();
        return;
      }
      if (e.key !== 'Tab' || !root.current) return;
      const all = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = all[0];
      const last = all[all.length - 1];
      if (!first || !last) return;
      const inside = root.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    // the browser's (or phone's) back button closes the dialog, with the same care
    const onBack = () => requestRef.current();
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onBack);
    const start =
      root.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      root.current?.querySelector<HTMLElement>('input:not([readonly]):not([type=checkbox]), textarea, select');
    start?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onBack);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          request();
        }
      }}
    >
      <section className="box modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={root}>
        <h2 className="box-title" id={titleId}>
          <span className="t-name">{title}</span>
        </h2>
        <div className="box-body">
          {asking && (
            <div className="discard" role="alert">
              <span>discard what you typed?</span>
              <button type="button" className="btn" autoFocus onClick={() => setAsking(false)}>
                keep editing
              </button>
              <button type="button" className="btn danger" onClick={onClose}>
                discard
              </button>
            </div>
          )}
          {children}
        </div>
        <button type="button" className="icon-btn modal-close" aria-label="close" onClick={request}>
          {GLYPH.close}
        </button>
      </section>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  message: string;
  confirm: string;
  cancel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A yes-or-no question. The safe answer has the focus. */
export function ConfirmDialog({ title, message, confirm, cancel, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="confirm-text">{message}</p>
      <div className="form-actions">
        <button type="button" className="btn primary" data-autofocus onClick={onCancel}>
          {cancel}
        </button>
        <button type="button" className="btn danger" onClick={onConfirm}>
          {confirm}
        </button>
      </div>
    </Modal>
  );
}
