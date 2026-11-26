import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Centered box over a dimmed page. Esc or a click outside closes it; the first field gets focus. */
export function Modal({ title, onClose, children }: ModalProps) {
  const root = useRef<HTMLElement>(null);
  // the page re-renders every couple of seconds as data streams in: keep one stable listener
  // and never re-focus, or the cursor would jump out of the field being typed in
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
      }
    };
    window.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLElement>('input:not([readonly]):not([type=checkbox]), textarea, select')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close.current();
      }}
    >
      <section className="box modal" role="dialog" aria-modal="true" aria-label={title} ref={root}>
        <h2 className="box-title">
          <span className="t-name">{title}</span>
        </h2>
        <div className="box-body">{children}</div>
      </section>
    </div>
  );
}
