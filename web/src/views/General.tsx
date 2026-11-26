import { useEffect, useState } from 'react';
import type { ConfigState } from '@clearview/shared';
import { Field } from '../components/Form';
import type { SaveFn } from '../lib/api';
import { applyAccent, DEFAULT_ACCENT, isReadable, normalizeHex, PRESETS } from '../lib/theme';

interface GeneralEditorProps {
  state: ConfigState;
  onSave: SaveFn;
  say: (msg: string) => void;
}

/** Browser tab title and accent colour. The colour previews live while you pick and is saved with the button. */
export function GeneralEditor({ state, onSave, say }: GeneralEditorProps) {
  const savedAccent = state.config.accent ?? '';
  const savedTitle = state.config.title ?? '';
  const [title, setTitle] = useState(savedTitle);
  const [accent, setAccent] = useState(savedAccent); // '' means the built-in colour
  const [hexText, setHexText] = useState(savedAccent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = accent ? normalizeHex(accent) : null;
  const shown = chosen ?? DEFAULT_ACCENT;
  const readable = isReadable(shown);
  const hexValid = hexText.trim() === '' || normalizeHex(hexText) !== null;
  const dirty = title.trim() !== savedTitle || (chosen ?? '') !== savedAccent;
  const canSave = state.writable && dirty && !busy && readable && hexValid;

  // preview while picking; go back to the saved colour when this form goes away
  useEffect(() => {
    applyAccent(chosen);
    return () => applyAccent(savedAccent || null);
  }, [chosen, savedAccent]);

  const pick = (hex: string) => {
    setAccent(hex);
    setHexText(hex);
  };

  const save = async () => {
    if (!canSave) return;
    const { title: _title, accent: _accent, ...rest } = state.config;
    const next = { ...rest, ...(title.trim() ? { title: title.trim() } : {}), ...(chosen ? { accent: chosen } : {}) };
    setBusy(true);
    setError(null);
    const result = await onSave(next);
    setBusy(false);
    if (result.ok) say('saved');
    else setError(result.error);
  };

  const revert = () => {
    setTitle(savedTitle);
    pick(savedAccent);
    setError(null);
  };

  return (
    <div className="general">
      <Field label="title" hint="shown in the browser tab, for example your server's name">
        <input className="input" value={title} readOnly={!state.writable} onChange={(e) => setTitle(e.target.value)} placeholder="tower" />
      </Field>

      <div className="field">
        <span className="field-label">accent colour</span>
        <div className="swatches">
          {PRESETS.map((p) => {
            const on = (chosen ?? DEFAULT_ACCENT) === p.hex;
            return (
              <button
                key={p.name}
                type="button"
                className={`swatch${on ? ' on' : ''}`}
                style={{ background: p.hex }}
                title={p.name}
                aria-label={p.name}
                aria-pressed={on}
                disabled={!state.writable}
                onClick={() => pick(p.hex === DEFAULT_ACCENT ? '' : p.hex)}
              />
            );
          })}
          <input
            type="color"
            className="swatch-input"
            aria-label="pick any colour"
            value={shown}
            disabled={!state.writable}
            onChange={(e) => pick(e.target.value)}
          />
          <input
            className="input hex"
            value={hexText}
            readOnly={!state.writable}
            onChange={(e) => {
              setHexText(e.target.value);
              const n = normalizeHex(e.target.value);
              if (n) setAccent(n);
              else if (e.target.value.trim() === '') setAccent('');
            }}
            placeholder={DEFAULT_ACCENT}
            aria-label="colour code"
            spellCheck={false}
          />
          <button type="button" className="btn" onClick={() => pick('')} disabled={!state.writable || (!accent && !hexText)}>
            default
          </button>
        </div>
        <span className="field-hint">Used for headings, the selected row and highlights. The page shows your choice as you pick it. Clear it for the built-in orange.</span>
        {!readable && <span className="c-err">That colour is too dark to read on the dark background. Pick a lighter one.</span>}
        {!hexValid && <span className="c-warn">Not a colour. Use a hex code like #3b82f6.</span>}
      </div>

      {error && (
        <div className="form-errors" role="alert">
          ⚠ {error}
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn primary" onClick={() => void save()} disabled={!canSave}>
          {busy ? 'saving…' : 'save'}
        </button>
        <button type="button" className="btn" onClick={revert} disabled={!dirty}>
          revert
        </button>
        <span className="c-faint">{dirty ? 'unsaved, previewing' : ''}</span>
      </div>
    </div>
  );
}
