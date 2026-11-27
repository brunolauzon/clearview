import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ConfigIssue, ConfigState, FileConfig, Units } from '@clearview/shared';
import { DEFAULT_THEME_ID, THEMES } from '../../../shared/themes';
import { Note } from '../components/Box';
import { Field, SaveError } from '../components/Form';
import type { ToastTone } from '../components/Toast';
import type { SaveFn } from '../lib/api';
import { parseSymbols } from '../lib/configEdit';
import { GLYPH } from '../lib/glyphs';
import { applyLook, isReadable, normalizeHex, PRESETS, resolvePalette } from '../lib/theme';

interface GeneralEditorProps {
  state: ConfigState;
  onSave: SaveFn;
  say: (msg: string, tone?: ToastTone) => void;
  onDirty: (dirty: boolean) => void;
}

const MAX_STOCKS = 6; // the server enforces the same limit

/** The fields of this form as the file holds them, tidied so that comparing two of them means something. */
function read(c: FileConfig) {
  return {
    title: (c.title ?? '').trim(),
    theme: c.theme ?? DEFAULT_THEME_ID,
    background: normalizeHex(c.background ?? '') ?? '',
    accent: normalizeHex(c.accent ?? '') ?? '',
    location: (c.weather?.location ?? '').trim(),
    units: (c.weather?.units ?? 'metric') as Units,
    stocks: parseSymbols((c.stocks ?? []).join(',')).join(', '),
  };
}

type Values = ReturnType<typeof read>;

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
  presets?: { name: string; hex: string }[];
}

function ColorField({ label, hint, color, shown, presets }: ColorFieldProps) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="field-label" aria-hidden>
        {label}
      </span>
      <div className="swatches">
        {presets?.map((p) => (
          <button
            key={p.name}
            type="button"
            className="swatch"
            style={{ background: p.hex }}
            title={p.name}
            aria-label={`${label} ${p.name}`}
            aria-pressed={shown === p.hex}
            onClick={() => color.pick(p.hex)}
          >
            <span aria-hidden>{shown === p.hex ? GLYPH.check : ''}</span>
          </button>
        ))}
        <input type="color" className="swatch-input" aria-label={`pick any ${label}`} title="pick any colour" value={shown} onChange={(e) => color.pick(e.target.value)} />
        <input
          className="input hex"
          value={color.text}
          onChange={(e) => color.type(e.target.value)}
          placeholder={shown}
          aria-label={`${label} as a hex code`}
          aria-invalid={!color.valid || undefined}
          spellCheck={false}
          autoCapitalize="off"
        />
        <button type="button" className="btn" onClick={() => color.pick('')} disabled={color.text === ''}>
          theme default
        </button>
      </div>
      {!color.valid && (
        <span className="field-error" role="alert">
          {GLYPH.warn} not a colour. use a hex code like #3b82f6.
        </span>
      )}
      <span className="field-hint">{hint}</span>
    </div>
  );
}

/** Title, theme and colours, weather and stocks. The look previews live while you pick; everything is saved with the button. */
export function GeneralEditor({ state, onSave, say, onDirty }: GeneralEditorProps) {
  const file = read(state.config);
  const fileSig = JSON.stringify(file);

  /** what the form started from; the draft is "changed" relative to this */
  const [base, setBase] = useState<Values>(file);
  const [title, setTitle] = useState(file.title);
  const [theme, setTheme] = useState(file.theme);
  const background = useColor(file.background);
  const accent = useColor(file.accent);
  const [location, setLocation] = useState(file.location);
  const [units, setUnits] = useState<Units>(file.units);
  const [stocks, setStocks] = useState(file.stocks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ConfigIssue[]>([]);

  const symbols = parseSymbols(stocks);
  const draft: Values = {
    title: title.trim(),
    theme,
    background: background.chosen ?? '',
    accent: accent.chosen ?? '',
    location: location.trim(),
    // units only mean something once there is a place
    units: location.trim() ? units : base.units,
    stocks: symbols.join(', '),
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  // someone else saved these settings while this draft was open
  const stale = dirty && !busy && fileSig !== JSON.stringify(base);

  const load = (v: Values) => {
    setBase(v);
    setTitle(v.title);
    setTheme(v.theme);
    background.pick(v.background);
    accent.pick(v.accent);
    setLocation(v.location);
    setUnits(v.units);
    setStocks(v.stocks);
    setError(null);
    setIssues([]);
  };

  // follow the file while there is nothing of ours to lose
  useEffect(() => {
    if (!dirty) load(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileSig]);

  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);

  const painted = resolvePalette({ theme, background: background.chosen, accent: accent.chosen });
  const accentReadable = isReadable(painted.colors.accent, painted.colors.bg);
  const tooMany = symbols.length > MAX_STOCKS;
  const canSave = state.writable && dirty && !busy && !stale && painted.textReadable && accentReadable && background.valid && accent.valid && !tooMany;

  // preview while picking; go back to the saved look when this form goes away
  const savedLook = useRef({ theme: file.theme, background: file.background || null, accent: file.accent || null });
  savedLook.current = { theme: file.theme, background: file.background || null, accent: file.accent || null };
  useEffect(() => {
    applyLook({ theme, background: background.chosen, accent: accent.chosen });
    return () => applyLook(savedLook.current);
  }, [theme, background.chosen, accent.chosen]);

  const pickTheme = (id: string) => {
    setTheme(id);
    background.pick('');
    accent.pick('');
  };

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
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
    const next: FileConfig = {
      ...rest,
      ...(draft.title ? { title: draft.title } : {}),
      ...(theme !== DEFAULT_THEME_ID ? { theme } : {}),
      ...(draft.background ? { background: draft.background } : {}),
      ...(draft.accent ? { accent: draft.accent } : {}),
      ...(draft.location ? { weather: { location: draft.location, units } } : {}),
      ...(symbols.length > 0 ? { stocks: symbols } : {}),
    };
    setBusy(true);
    setError(null);
    setIssues([]);
    const result = await onSave(next);
    setBusy(false);
    if (result.ok) {
      load(read(next));
      say('saved settings', 'ok');
    } else {
      setError(result.error);
      setIssues(result.issues);
    }
  };

  const blocked = !painted.textReadable
    ? 'text would be hard to read on that background. pick a darker or a lighter one.'
    : !accentReadable
      ? 'that accent is hard to read on this background. pick one with more contrast.'
      : tooMany
        ? `that is ${symbols.length} tickers. the header has room for ${MAX_STOCKS}.`
        : null;

  return (
    <form
      className="general"
      onSubmit={(e) => void save(e)}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className="settings-cols">
        <fieldset disabled={!state.writable}>
          <legend>appearance</legend>

          <div className="field" role="group" aria-label="theme">
            <span className="field-label" aria-hidden>
              theme
            </span>
            <div className="themes">
              {THEMES.map((t) => {
                const on = theme === t.id;
                const c = resolvePalette({ theme: t.id, background: null, accent: null });
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="theme-card"
                    aria-pressed={on}
                    aria-label={`${t.name}, ${t.light ? 'light' : 'dark'}`}
                    onClick={() => pickTheme(t.id)}
                    style={{ background: c.colors.bg, color: c.colors.fg, borderColor: on ? c.accentText : c.colors.border }}
                  >
                    <span style={{ color: c.accentText, fontWeight: 700 }}>
                      {on ? `${GLYPH.check} ` : ''}
                      {t.name}
                    </span>
                    <span className="swatches-row" aria-hidden>
                      {[c.colors.ok, c.colors.warn, c.colors.err, c.colors.info].map((colour, i) => (
                        <span key={i} style={{ color: colour }}>
                          {GLYPH.dot}
                        </span>
                      ))}
                      <span style={{ color: c.colors.dim }}>{t.light ? 'light' : 'dark'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="field-hint">Popular terminal colour schemes. The page shows your pick at once. Picking a theme clears your own background and accent below.</span>
          </div>

          <ColorField label="background colour" hint="Replaces the theme's background. Text and surfaces adjust to match." color={background} shown={painted.colors.bg} />
          <ColorField label="accent colour" hint="Headings, the selected row and highlights." color={accent} shown={painted.colors.accent} presets={PRESETS} />
        </fieldset>

        <fieldset disabled={!state.writable}>
          <legend>title and header</legend>

          <Field label="title" hint="shown in the browser tab, for example your server's name">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="tower" />
          </Field>

          <Field
            label="weather location"
            hint="A city (Paris, or London, CA) or latitude,longitude. Your server asks open-meteo.com about this place. Leave blank to hide the weather."
          >
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Paris, FR" />
          </Field>
          <Field label="temperature units">
            <select className="input" value={units} onChange={(e) => setUnits(e.target.value as Units)}>
              <option value="metric">metric (°C)</option>
              <option value="imperial">imperial (°F)</option>
            </select>
          </Field>

          <Field
            label="stock tickers"
            error={tooMany ? `${symbols.length} tickers; the limit is ${MAX_STOCKS}` : null}
            hint={`Up to ${MAX_STOCKS}, separated by commas or spaces, as Yahoo Finance writes them: AAPL, ^GSPC, SHOP.TO, BTC-USD. Prices come from Yahoo (unofficial, may be delayed). Leave blank to hide.`}
          >
            <input className="input" value={stocks} onChange={(e) => setStocks(e.target.value)} placeholder="AAPL, ^GSPC, SHOP.TO" spellCheck={false} autoCapitalize="characters" />
          </Field>
          <p className="c-dim">The weather and tickers show on windows at least 1200 pixels wide.</p>
        </fieldset>
      </div>

      <div className="savebar">
        <SaveError error={error} issues={issues} />
        {blocked && <Note tone="err">{blocked}</Note>}
        {stale && (
          <Note tone="warn">
            these settings were changed somewhere else while you were editing.{' '}
            <button type="button" className="text-btn" onClick={() => load(file)}>
              load the new ones
            </button>
          </Note>
        )}
        <div className="form-actions">
          <button type="submit" className="btn primary" disabled={!canSave}>
            {busy ? 'saving…' : 'save changes'}
          </button>
          <button type="button" className="btn" onClick={() => load(file)} disabled={!dirty}>
            revert
          </button>
          <span className={dirty ? 'c-warn' : 'c-dim'}>{dirty ? 'unsaved changes (previewing)' : 'no changes'}</span>
        </div>
      </div>
    </form>
  );
}
