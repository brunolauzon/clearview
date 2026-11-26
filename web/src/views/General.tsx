import { useEffect, useState } from 'react';
import type { ConfigIssue, ConfigState, Units } from '@clearview/shared';
import { DEFAULT_THEME_ID, THEMES } from '../../../shared/themes';
import { Field } from '../components/Form';
import type { SaveFn } from '../lib/api';
import { parseSymbols } from '../lib/configEdit';
import { applyLook, contrast, isReadable, normalizeHex, PRESETS, resolvePalette } from '../lib/theme';

interface GeneralEditorProps {
  state: ConfigState;
  onSave: SaveFn;
  say: (msg: string) => void;
}

const MAX_STOCKS = 6; // the server enforces the same limit

/** A colour that may be left unset ("use the theme's"), edited by swatch, native picker or hex text. */
function useColor(initial: string) {
  const [value, setValue] = useState(initial);
  const [text, setText] = useState(initial);
  return {
    chosen: value ? normalizeHex(value) : null,
    text,
    valid: text.trim() === '' || normalizeHex(text) !== null,
    pick: (hex: string) => {
      setValue(hex);
      setText(hex);
    },
    // keep what is being typed as typed; apply it once it reads as a colour
    type: (raw: string) => {
      setText(raw);
      const n = normalizeHex(raw);
      if (n) setValue(n);
      else if (raw.trim() === '') setValue('');
    },
  };
}

interface ColorFieldProps {
  label: string;
  hint: string;
  color: ReturnType<typeof useColor>;
  /** the colour in use, whether chosen here or coming from the theme */
  shown: string;
  writable: boolean;
  presets?: { name: string; hex: string }[];
}

function ColorField({ label, hint, color, shown, writable, presets }: ColorFieldProps) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="swatches">
        {presets?.map((p) => (
          <button
            key={p.name}
            type="button"
            className={`swatch${shown === p.hex ? ' on' : ''}`}
            style={{ background: p.hex }}
            title={p.name}
            aria-label={`${label} ${p.name}`}
            aria-pressed={shown === p.hex}
            disabled={!writable}
            onClick={() => color.pick(p.hex)}
          />
        ))}
        <input
          type="color"
          className="swatch-input"
          aria-label={`pick any ${label}`}
          value={shown}
          disabled={!writable}
          onChange={(e) => color.pick(e.target.value)}
        />
        <input
          className="input hex"
          value={color.text}
          readOnly={!writable}
          onChange={(e) => color.type(e.target.value)}
          placeholder={shown}
          aria-label={`${label} code`}
          spellCheck={false}
        />
        <button type="button" className="btn" onClick={() => color.pick('')} disabled={!writable || color.text === ''}>
          theme default
        </button>
      </div>
      <span className="field-hint">{hint}</span>
      {!color.valid && <span className="c-warn">Not a colour. Use a hex code like #3b82f6.</span>}
    </div>
  );
}

/** Title, theme and colours, weather and stocks. The look previews live while you pick; everything is saved with the button. */
export function GeneralEditor({ state, onSave, say }: GeneralEditorProps) {
  const saved = {
    title: state.config.title ?? '',
    theme: state.config.theme ?? DEFAULT_THEME_ID,
    background: state.config.background ?? '',
    accent: state.config.accent ?? '',
    location: state.config.weather?.location ?? '',
    units: (state.config.weather?.units ?? 'metric') as Units,
    stocks: (state.config.stocks ?? []).join(', '),
  };

  const [title, setTitle] = useState(saved.title);
  const [theme, setTheme] = useState(saved.theme);
  const background = useColor(saved.background);
  const accent = useColor(saved.accent);
  const [location, setLocation] = useState(saved.location);
  const [units, setUnits] = useState<Units>(saved.units);
  const [stocks, setStocks] = useState(saved.stocks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ConfigIssue[]>([]);

  const painted = resolvePalette({ theme, background: background.chosen, accent: accent.chosen }).colors;
  const textReadable = contrast(painted.fg, painted.bg) >= 4.5;
  const accentReadable = isReadable(painted.accent, painted.bg);
  const symbols = parseSymbols(stocks);
  const tooMany = symbols.length > MAX_STOCKS;
  const dirty =
    title.trim() !== saved.title ||
    theme !== saved.theme ||
    (background.chosen ?? '') !== saved.background ||
    (accent.chosen ?? '') !== saved.accent ||
    location.trim() !== saved.location ||
    (location.trim() !== '' && units !== saved.units) ||
    symbols.join(', ') !== saved.stocks;
  const canSave = state.writable && dirty && !busy && textReadable && accentReadable && background.valid && accent.valid && !tooMany;

  // preview while picking; go back to the saved look when this form goes away
  useEffect(() => {
    applyLook({ theme, background: background.chosen, accent: accent.chosen });
    return () => applyLook({ theme: saved.theme, background: saved.background || null, accent: saved.accent || null });
  }, [theme, background.chosen, accent.chosen, saved.theme, saved.background, saved.accent]);

  const pickTheme = (id: string) => {
    setTheme(id);
    background.pick('');
    accent.pick('');
  };

  const save = async () => {
    if (!canSave) return;
    const {
      title: _title,
      theme: _theme,
      background: _background,
      accent: _accent,
      weather: _weather,
      stocks: _stocks,
      ...rest
    } = state.config;
    const next = {
      ...rest,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(theme !== DEFAULT_THEME_ID ? { theme } : {}),
      ...(background.chosen ? { background: background.chosen } : {}),
      ...(accent.chosen ? { accent: accent.chosen } : {}),
      ...(location.trim() ? { weather: { location: location.trim(), units } } : {}),
      ...(symbols.length > 0 ? { stocks: symbols } : {}),
    };
    setBusy(true);
    setError(null);
    setIssues([]);
    const result = await onSave(next);
    setBusy(false);
    if (result.ok) say('saved');
    else {
      setError(result.error);
      setIssues(result.issues);
    }
  };

  const revert = () => {
    setTitle(saved.title);
    setTheme(saved.theme);
    background.pick(saved.background);
    accent.pick(saved.accent);
    setLocation(saved.location);
    setUnits(saved.units);
    setStocks(saved.stocks);
    setError(null);
    setIssues([]);
  };

  return (
    <div className="general">
      <Field label="title" hint="shown in the browser tab, for example your server's name">
        <input className="input" value={title} readOnly={!state.writable} onChange={(e) => setTitle(e.target.value)} placeholder="tower" />
      </Field>

      <div className="field">
        <span className="field-label">theme</span>
        <div className="themes">
          {THEMES.map((t) => {
            const on = theme === t.id;
            const c = t.colors;
            return (
              <button
                key={t.id}
                type="button"
                className="theme-card"
                aria-pressed={on}
                aria-label={`theme ${t.name}`}
                disabled={!state.writable}
                onClick={() => pickTheme(t.id)}
                style={{ background: c.bg, color: c.fg, borderColor: on ? c.accent : c.border }}
              >
                <span style={{ color: c.accent, fontWeight: 700 }}>
                  {on ? '▶ ' : ''}
                  {t.name}
                </span>
                <span className="swatches-row" aria-hidden>
                  {[c.ok, c.warn, c.err, c.info].map((colour, i) => (
                    <span key={i} style={{ color: colour }}>
                      ●
                    </span>
                  ))}
                  <span style={{ color: c.dim }}>{t.light ? 'light' : 'dark'}</span>
                </span>
              </button>
            );
          })}
        </div>
        <span className="field-hint">Popular terminal colour schemes. The page shows your pick at once. Picking a theme clears your own background and accent below.</span>
      </div>

      <ColorField
        label="background colour"
        hint="Replaces the theme's background. Text and surfaces adjust to match."
        color={background}
        shown={painted.bg}
        writable={state.writable}
      />
      <ColorField
        label="accent colour"
        hint="Headings, the selected row and highlights."
        color={accent}
        shown={painted.accent}
        writable={state.writable}
        presets={PRESETS}
      />
      {!textReadable && <div className="note c-err">Text would be hard to read on that background. Pick a darker or a lighter one.</div>}
      {textReadable && !accentReadable && <div className="note c-err">That accent is hard to read on this background. Pick one with more contrast.</div>}

      <Field
        label="weather location"
        hint="A city (Paris, or London, CA) or latitude,longitude. Your server asks open-meteo.com about this place. Leave blank to hide the weather."
      >
        <input className="input" value={location} readOnly={!state.writable} onChange={(e) => setLocation(e.target.value)} placeholder="Paris, FR" />
      </Field>
      <Field label="temperature units">
        <select className="input" value={units} disabled={!state.writable} onChange={(e) => setUnits(e.target.value as Units)}>
          <option value="metric">metric (°C)</option>
          <option value="imperial">imperial (°F)</option>
        </select>
      </Field>

      <Field
        label="stock tickers"
        hint={`Up to ${MAX_STOCKS}, separated by commas or spaces, as Yahoo Finance writes them: AAPL, ^GSPC, SHOP.TO, BTC-USD. Prices come from Yahoo (unofficial, may be delayed). Leave blank to hide.`}
      >
        <input
          className="input"
          value={stocks}
          readOnly={!state.writable}
          onChange={(e) => setStocks(e.target.value)}
          placeholder="AAPL, ^GSPC, SHOP.TO"
          spellCheck={false}
        />
      </Field>
      {tooMany && <div className="note c-err">That is {symbols.length} tickers. The header has room for {MAX_STOCKS}.</div>}

      {error && (
        <div className="form-errors" role="alert">
          <div>⚠ {error}</div>
          {issues.map((i) => (
            <div key={`${i.path}${i.message}`} className="c-dim">
              {i.path}: {i.message}
            </div>
          ))}
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
