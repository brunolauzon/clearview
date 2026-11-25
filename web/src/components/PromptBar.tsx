import { useEffect, useRef, useState } from 'react';
import { suggest } from '../lib/commands';

export type PromptMode = 'normal' | 'command' | 'filter';

interface PromptBarProps {
  mode: PromptMode;
  /** value to start with when the prompt opens (the current filter, for example) */
  initial: string;
  flash: string | null;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  onActivate: (mode: 'command' | 'filter') => void;
}

/** Bottom input line, styled like Claude Code's prompt box. `:` opens commands, `/` opens the filter. */
export function PromptBar({ mode, initial, flash, onChange, onSubmit, onCancel, onActivate }: PromptBarProps) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== 'normal') {
      setValue(initial);
      input.current?.focus();
    }
    // only when the mode flips, not on every keystroke echoed back through `initial`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const ghost = mode === 'command' ? suggest(value) : '';
  const sigil = mode === 'command' ? ':' : mode === 'filter' ? '/' : '>';

  return (
    <div className={`prompt${mode !== 'normal' ? ' active' : ''}`} onClick={() => mode === 'normal' && onActivate('command')}>
      <span className="sigil">{sigil}</span>
      {mode === 'normal' ? (
        <span className={flash ? 'flash' : 'placeholder'}>{flash ?? ':command   /filter   ?help'}</span>
      ) : (
        <div className="field">
          <input
            ref={input}
            value={value}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label={mode === 'command' ? 'command' : 'filter'}
            onChange={(e) => {
              setValue(e.target.value);
              if (mode === 'filter') onChange(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit(value);
              else if (e.key === 'Escape') onCancel();
              else if (e.key === 'Tab' && ghost) {
                e.preventDefault();
                setValue(value + ghost);
              } else if (e.key === 'Backspace' && value === '') onCancel();
            }}
          />
          {ghost && (
            <span className="ghost" aria-hidden>
              <span className="typed">{value}</span>
              {ghost}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
