import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { matchViews, type ViewId } from '../lib/commands';
import { GLYPH } from '../lib/glyphs';

export type PromptMode = 'normal' | 'command' | 'filter';

export type KeyHint = [keys: string, what: string];

interface StatusBarProps {
  mode: PromptMode;
  filter: string;
  /** what `/` narrows down in this view; null when there is no list to filter */
  noun: string | null;
  shown: number;
  total: number;
  hints: KeyHint[];
  connected: boolean;
  demo: boolean;
  version: string | null;
  onActivate: (mode: 'command' | 'filter') => void;
  onFilter: (value: string) => void;
  onClearFilter: () => void;
  /** leave the prompt, keeping what it did */
  onDone: () => void;
  /** a command was entered; null when nothing matches what was typed */
  onCommand: (view: ViewId | null, typed: string) => void;
}

/** Closes a prompt once focus leaves it altogether (not when it moves to the prompt's own button). */
const onLeave = (leave: () => void) => (e: FocusEvent<HTMLFormElement>) => {
  if (!e.currentTarget.contains(e.relatedTarget)) leave();
};

const quietInput = { spellCheck: false, autoComplete: 'off', autoCapitalize: 'off', autoCorrect: 'off' } as const;

function FilterPrompt({ filter, noun, shown, total, onFilter, onClearFilter, onDone }: StatusBarProps) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const cancel = () => {
    onClearFilter();
    onDone();
  };
  return (
    <form
      className="prompt"
      role="search"
      onBlur={onLeave(onDone)}
      onSubmit={(e) => {
        e.preventDefault();
        onDone();
      }}
    >
      <span className="sigil" aria-hidden>
        /
      </span>
      <input
        {...quietInput}
        ref={input}
        value={filter}
        enterKeyHint="search"
        placeholder={`filter ${noun}`}
        aria-label={`filter ${noun}`}
        onChange={(e) => onFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Backspace' && filter === '')) {
            e.preventDefault();
            cancel();
          }
        }}
      />
      <span className="c-dim prompt-count" aria-live="polite">
        {shown} of {total}
      </span>
      <span className="c-dim keys-only">
        <kbd>enter</kbd> keep · <kbd>esc</kbd> clear
      </span>
      <button type="button" className="btn touch-only" onMouseDown={(e) => e.preventDefault()} onClick={cancel}>
        clear
      </button>
    </form>
  );
}

/** `:` with the views listed above it, so nobody has to remember their names. */
function CommandPrompt({ onCommand, onDone }: StatusBarProps) {
  const [value, setValue] = useState('');
  const [active, setActive] = useState(0);
  const [moved, setMoved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  useEffect(() => input.current?.focus(), []);

  const options = matchViews(value);
  // Enter on an untouched, empty prompt does nothing, so nothing is highlighted then
  const highlight = value.trim() !== '' || moved ? options[active] : undefined;

  const step = (delta: number) => {
    if (options.length === 0) return;
    setActive((i) => (highlight ? (i + delta + options.length) % options.length : delta > 0 ? 0 : options.length - 1));
    setMoved(true);
  };

  return (
    <form
      className="prompt"
      onBlur={onLeave(onDone)}
      onSubmit={(e) => {
        e.preventDefault();
        if (highlight) onCommand(highlight.id, value);
        else if (value.trim()) onCommand(null, value);
        else onDone();
      }}
    >
      <span className="sigil" aria-hidden>
        :
      </span>
      <input
        {...quietInput}
        ref={input}
        value={value}
        enterKeyHint="go"
        placeholder="type a view name"
        role="combobox"
        aria-label="go to view"
        aria-expanded
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={highlight ? `${listId}-${highlight.id}` : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setActive(0);
          setMoved(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Backspace' && value === '')) {
            e.preventDefault();
            onDone();
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            step(e.key === 'ArrowDown' ? 1 : -1);
          } else if (e.key === 'Tab' && !e.shiftKey && highlight && value !== highlight.id) {
            e.preventDefault();
            setValue(highlight.id);
            setActive(0);
          }
        }}
      />
      <span className="c-dim keys-only">
        <kbd>↑↓</kbd> choose · <kbd>tab</kbd> complete · <kbd>enter</kbd> go
      </span>
      <ul className="palette" id={listId} role="listbox" aria-label="views">
        {options.map((v, i) => (
          <li
            key={v.id}
            id={`${listId}-${v.id}`}
            role="option"
            aria-selected={highlight?.id === v.id}
            onMouseDown={(e) => e.preventDefault()}
            onMouseMove={() => {
              setActive(i);
              setMoved(true);
            }}
            onClick={() => onCommand(v.id, value)}
          >
            <span>{v.id}</span>
            <span className="palette-about">{v.about}</span>
            <kbd>{v.key ?? '?'}</kbd>
          </li>
        ))}
        {options.length === 0 && <li className="c-dim">no view matches “{value.trim()}”</li>}
      </ul>
    </form>
  );
}

/** Bottom bar: the filter and command prompts, the keys that work here, and the connection. */
export function StatusBar(props: StatusBarProps) {
  const { mode, filter, noun, hints, connected, demo, version, onActivate, onClearFilter } = props;
  return (
    <footer className={`statusbar${mode === 'normal' ? (noun ? '' : ' idle') : ' prompting'}`}>
      {mode === 'filter' ? (
        <FilterPrompt {...props} />
      ) : mode === 'command' ? (
        <CommandPrompt {...props} />
      ) : (
        <>
          <div className="status-actions">
            {noun &&
              (filter ? (
                <span className="filter-chip">
                  <button type="button" className="status-btn" onClick={() => onActivate('filter')} title={`edit the ${noun} filter`}>
                    <kbd>/</kbd> {filter}
                  </button>
                  <button type="button" className="status-btn" aria-label="clear filter" onClick={onClearFilter}>
                    {GLYPH.close}
                  </button>
                </span>
              ) : (
                <button type="button" className="status-btn" onClick={() => onActivate('filter')}>
                  <kbd>/</kbd> filter {noun}
                </button>
              ))}
            <button type="button" className="status-btn status-command" onClick={() => onActivate('command')}>
              <kbd>:</kbd> go to
            </button>
          </div>
          <ul className="keyhints keys-only" aria-label="keys in this view">
            {hints.map(([keys, what]) => (
              <li key={keys}>
                <kbd>{keys}</kbd> {what}
              </li>
            ))}
          </ul>
          <div className="status-meta">
            {demo && <span className="c-accent">demo data</span>}
            <span className={connected ? 'c-ok' : 'c-err'}>{connected ? `${GLYPH.dot} live` : '○ reconnecting…'}</span>
            {version && <span className="c-dim version">v{version}</span>}
          </div>
        </>
      )}
    </footer>
  );
}
