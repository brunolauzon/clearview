import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConfigIssue, ConfigState, ContainerInfo } from '@clearview/shared';
import { Box, Empty, Loading, Note } from '../components/Box';
import { SaveError } from '../components/Form';
import { Table, type Column } from '../components/Table';
import type { ToastTone } from '../components/Toast';
import type { SaveFn, SaveOutcome } from '../lib/api';
import {
  containerEntries,
  moveGroup,
  removeContainer,
  removeGroup,
  removeLink,
  removeShortcut,
  shortcutEntries,
  type ContainerEntry,
  type ShortcutEntry,
} from '../lib/configEdit';
import type { Editor } from '../lib/editor';
import { shortUrl } from '../lib/format';
import { GLYPH } from '../lib/glyphs';
import { revealInRow } from '../lib/scroll';
import { GeneralEditor } from './General';

export type Section = 'links' | 'categories' | 'containers' | 'shortcuts' | 'general' | 'yaml';
const SECTIONS: Section[] = ['links', 'categories', 'containers', 'shortcuts', 'general', 'yaml'];

/** how long a delete stays armed, waiting for the second press */
const ARMED_MS = 5000;

const ADD_LABEL: Partial<Record<Section, string>> = {
  links: 'add a link',
  categories: 'add a category',
  containers: 'customise a container',
  shortcuts: 'add a shortcut',
};

interface ConfigViewProps {
  state: ConfigState | null;
  /** live containers, for match counts */
  containers: ContainerInfo[];
  /** false while a form is open or the prompt has focus */
  active: boolean;
  section: Section;
  onSection: (section: Section) => void;
  onEdit: (editor: Editor) => void;
  onSave: SaveFn;
  onSaveYaml: (yaml: string) => Promise<SaveOutcome>;
  say: (msg: string, tone?: ToastTone) => void;
  /** the general or yaml form has changes that leaving would lose */
  onDirty: (dirty: boolean) => void;
}

export function ConfigView({ state, containers, active, section, onSection, onEdit, onSave, onSaveYaml, say, onDirty }: ConfigViewProps) {
  const [sel, setSel] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<number>();
  const yamlBox = useRef<HTMLTextAreaElement>(null);
  const tabs = useRef<HTMLDivElement>(null);

  const config = state?.config;
  const links = config?.links ?? [];
  const groups = config?.groups ?? [];
  const entries = config ? containerEntries(config) : [];
  const shortcuts = config ? shortcutEntries(config) : [];
  const rows = { links, categories: groups, containers: entries, shortcuts, general: [], yaml: [] };
  const count = rows[section].length;

  useEffect(() => {
    setSel((i) => Math.min(i, Math.max(0, count - 1)));
  }, [count]);

  useEffect(() => {
    setSel(0);
    setArmed(null);
    const tab = tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    revealInRow(tabs.current, tab);
    // keyboard focus stays on the tab row when the section changes underneath it
    if (document.activeElement?.getAttribute('role') === 'tab') tab?.focus({ preventScroll: true });
    // `state` arriving is what first puts the tabs on the page
  }, [section, state === null]);

  useEffect(() => () => window.clearTimeout(armTimer.current), []);

  const writable = state?.writable ?? false;
  const isList = section !== 'general' && section !== 'yaml';
  const readOnly = () => say(state?.readOnlyReason ?? 'config is read-only', 'err');

  const step = useCallback(
    (delta: number) => onSection(SECTIONS[(SECTIONS.indexOf(section) + delta + SECTIONS.length) % SECTIONS.length]!),
    [section, onSection],
  );

  /** Run a change made without a form (delete, reorder) and report the outcome. Returns whether it was saved. */
  const apply = useCallback(
    async (next: Parameters<SaveFn>[0], done?: string): Promise<boolean> => {
      const result = await onSave(next);
      if (!result.ok) say(result.error, 'err');
      else if (done) say(done, 'ok');
      return result.ok;
    },
    [onSave, say],
  );

  const add = () => {
    if (section === 'links') onEdit({ kind: 'link', index: null });
    else if (section === 'categories') onEdit({ kind: 'group', index: null });
    else if (section === 'containers') onEdit({ kind: 'container', name: null });
    else if (section === 'shortcuts') onEdit({ kind: 'shortcut', key: null });
  };

  const edit = (index = sel) => {
    if (section === 'links' && links[index]) onEdit({ kind: 'link', index });
    else if (section === 'categories' && groups[index]) onEdit({ kind: 'group', index });
    else if (section === 'containers' && entries[index]) onEdit({ kind: 'container', name: entries[index]!.name });
    else if (section === 'shortcuts' && shortcuts[index]) onEdit({ kind: 'shortcut', key: shortcuts[index]!.key });
  };

  const verb = section === 'containers' ? 'reset' : 'delete';
  const selectedName =
    section === 'links'
      ? links[sel]?.name
      : section === 'categories'
        ? groups[sel]?.name
        : section === 'shortcuts'
          ? shortcuts[sel]?.key
          : entries[sel]?.name;
  const armKey = `${section}:${selectedName}`;
  const isArmed = count > 0 && armed === armKey;

  /** Delete needs the key (or button) pressed twice, so a slip does not remove anything. */
  const remove = () => {
    if (!config || count === 0) return;
    if (!writable) return readOnly();
    if (!isArmed) {
      setArmed(armKey);
      say(`press d again to ${verb} ${selectedName}`);
      window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => setArmed(null), ARMED_MS);
      return;
    }
    setArmed(null);
    const done = `${verb === 'reset' ? 'reset' : 'deleted'} ${selectedName}`;
    if (section === 'links') void apply(removeLink(config, sel), done);
    else if (section === 'categories') void apply(removeGroup(config, sel), done);
    else if (section === 'containers' && entries[sel]) void apply(removeContainer(config, entries[sel]!.name), done);
    else if (section === 'shortcuts' && shortcuts[sel]) void apply(removeShortcut(config, shortcuts[sel]!.key), done);
  };

  const move = async (delta: -1 | 1) => {
    if (section !== 'categories' || !config) return;
    if (!writable) return readOnly();
    const to = sel + delta;
    if (to < 0 || to >= groups.length) return;
    if (await apply(moveGroup(config, sel, delta))) setSel(to);
  };

  // rebuilt on every render so it always sees the current rows
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // a focused button or link does its own thing
    if ((e.key === 'Enter' || e.key === ' ') && t.closest('a, button, summary')) return;

    let handled = true;
    switch (e.key) {
      case '[':
      case 'ArrowLeft':
        step(-1);
        break;
      case ']':
      case 'ArrowRight':
        step(1);
        break;
      case 'j':
      case 'ArrowDown':
        if (isList) setSel((i) => Math.min(Math.max(0, count - 1), i + 1));
        else handled = false;
        break;
      case 'k':
      case 'ArrowUp':
        if (isList) setSel((i) => Math.max(0, i - 1));
        else handled = false;
        break;
      case 'a':
        if (isList) add();
        else handled = false;
        break;
      case 'e':
      case 'Enter':
        if (isList) edit();
        else handled = false;
        break;
      case 'd':
        if (isList && !e.repeat) remove();
        else handled = false;
        break;
      case 'K':
        void move(-1);
        break;
      case 'J':
        void move(1);
        break;
      case 'i':
        if (section === 'yaml') yamlBox.current?.focus();
        else handled = false;
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  useEffect(() => {
    if (!active) return;
    const listen = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, [active]);

  if (!state || !config) {
    return (
      <Box title="config">
        <Loading what="settings" />
      </Box>
    );
  }

  const list = { sel, onSelect: setSel, onActivate: edit, pinned: true };
  const empty = (text: string) => (
    <Empty action={writable ? ADD_LABEL[section] : undefined} onAction={add}>
      {text}
    </Empty>
  );
  const sizes: Partial<Record<Section, number>> = { links: links.length, categories: groups.length, containers: entries.length, shortcuts: shortcuts.length };

  return (
    <>
      {!state.persisted && <Note tone="warn">demo mode: changes apply right away but are not saved anywhere.</Note>}
      {!state.writable && <Note tone="warn">read-only: {state.readOnlyReason}</Note>}
      {state.warning && <Note tone="warn">{state.warning}</Note>}
      {state.loadError && (
        <Note tone="err">
          {state.path} has errors ({state.loadError}). The last good settings stay in use until it is fixed; see the yaml tab.
        </Note>
      )}

      <Box title="config" hint={state.persisted ? state.path : 'in memory'} className="grow">
        <div className="tabs-bar">
          <div className="tabs" role="tablist" aria-label="settings sections" ref={tabs}>
            {SECTIONS.map((s) => (
              <button
                key={s}
                id={`tab-${s}`}
                type="button"
                role="tab"
                aria-selected={s === section}
                aria-controls="config-panel"
                className="tab"
                tabIndex={s === section ? 0 : -1}
                onClick={() => onSection(s)}
              >
                {s}
                {sizes[s] !== undefined && <span className="tab-count">{sizes[s]}</span>}
              </button>
            ))}
          </div>
          <span className="c-dim keys-only">
            <kbd>[</kbd> <kbd>]</kbd> switch section
          </span>
        </div>

        <div id="config-panel" role="tabpanel" aria-labelledby={`tab-${section}`}>
          {isList && count > 0 && (
            <div className="toolbar" role="group" aria-label={`actions for ${section}`}>
              <button type="button" className="btn primary" onClick={add} disabled={!writable}>
                <kbd>a</kbd> add
              </button>
              <button type="button" className="btn" onClick={() => edit()} disabled={!writable}>
                <kbd>e</kbd> edit
              </button>
              {section === 'categories' && (
                <>
                  <button type="button" className="btn" onClick={() => void move(-1)} disabled={!writable || sel === 0}>
                    <kbd>K</kbd> move up
                  </button>
                  <button type="button" className="btn" onClick={() => void move(1)} disabled={!writable || sel >= groups.length - 1}>
                    <kbd>J</kbd> move down
                  </button>
                </>
              )}
              <span className="toolbar-gap" />
              <button type="button" className={`btn danger${isArmed ? ' armed' : ''}`} onClick={remove} disabled={!writable}>
                <kbd>d</kbd> {isArmed ? `confirm: ${verb} ${selectedName}` : verb}
              </button>
              {isArmed && (
                <button type="button" className="btn" onClick={() => setArmed(null)}>
                  keep it
                </button>
              )}
            </div>
          )}

          {section === 'links' && (
            <Table
              {...list}
              label="links"
              cols={LINK_COLS}
              rows={links}
              rowKey={(l) => l.url + l.name}
              empty={empty('no links yet. a link is another device on your network, such as a router or a NAS.')}
            />
          )}

          {section === 'categories' && (
            <>
              <Table
                {...list}
                label="categories"
                cols={groupCols(containers, groups)}
                rows={groups}
                rowKey={(g) => g.name}
                empty={empty('no categories yet. group containers under headings such as Media or Infrastructure.')}
              />
              {groups.length > 0 && <p className="c-dim section-note">Order here is the order on the containers page. The first category that matches a container wins.</p>}
            </>
          )}

          {section === 'containers' && (
            <>
              <Table
                {...list}
                label="customised containers"
                cols={CONTAINER_COLS}
                rows={entries}
                rowKey={(e) => e.name}
                empty={empty('nothing customised. rename, re-address, categorise or hide a container here, or with its edit button on the containers page.')}
              />
              {entries.length > 0 && (
                <p className="c-dim section-note">Only containers with a custom setting are listed. Hidden ones are not shown on the dashboard; reset a row to show it again.</p>
              )}
            </>
          )}

          {section === 'shortcuts' && (
            <>
              <Table
                {...list}
                label="shortcuts"
                cols={SHORTCUT_COLS}
                rows={shortcuts}
                rowKey={(s) => s.key}
                empty={empty('no shortcuts yet. make a letter open a website, for example y for youtube.com.')}
              />
              {shortcuts.length > 0 && <p className="c-dim section-note">Press the letter on any page of the dashboard to open its address in a new tab.</p>}
            </>
          )}

          {section === 'general' && <GeneralEditor state={state} onSave={onSave} say={say} onDirty={onDirty} />}

          {section === 'yaml' && <YamlEditor state={state} writable={writable} onSaveYaml={onSaveYaml} say={say} boxRef={yamlBox} onDirty={onDirty} />}
        </div>
      </Box>
    </>
  );
}

// ---------- tables ----------

const none = <span className="c-dim">-</span>;

const address = (url: string) => (
  <span className="c-accent">
    {GLYPH.open} {shortUrl(url)}
  </span>
);

const LINK_COLS: Column<ConfigState['config']['links'][number]>[] = [
  { id: 'name', title: 'name', width: 'minmax(12ch, 2fr)', render: (l) => l.name },
  { id: 'url', title: 'address', width: 'minmax(16ch, 2fr)', render: (l) => address(l.url) },
  { id: 'group', title: 'group', width: '12ch', min: 'md', render: (l) => <span className="c-dim">{l.group}</span> },
  { id: 'check', title: 'check', width: '7ch', min: 'md', render: (l) => <span className="c-dim">{l.check}</span> },
  { id: 'note', title: 'note', width: 'minmax(10ch, 2fr)', min: 'lg', render: (l) => <span className="c-dim">{l.description ?? ''}</span> },
];

function groupCols(containers: ContainerInfo[], all: ConfigState['config']['groups']): Column<ConfigState['config']['groups'][number]>[] {
  return [
    { id: 'order', title: '#', width: '3ch', render: (g) => <span className="c-dim">{all.indexOf(g) + 1}</span> },
    { id: 'name', title: 'category', width: 'minmax(14ch, 1.5fr)', render: (g) => g.name },
    {
      id: 'now',
      title: 'now',
      width: '6ch',
      align: 'right',
      render: (g) => containers.filter((c) => c.group === g.name).length,
    },
    { id: 'patterns', title: 'containers', width: 'minmax(20ch, 4fr)', min: 'md', wrap: true, render: (g) => <span className="c-dim">{g.containers.join(', ') || '-'}</span> },
  ];
}

const CONTAINER_COLS: Column<ContainerEntry>[] = [
  { id: 'name', title: 'container', width: 'minmax(12ch, 2fr)', render: (e) => e.name },
  { id: 'as', title: 'shown as', width: 'minmax(10ch, 1.5fr)', min: 'md', render: (e) => e.override.name ?? none },
  { id: 'group', title: 'category', width: '14ch', render: (e) => e.override.group ?? none },
  { id: 'url', title: 'webui', width: 'minmax(12ch, 2fr)', min: 'lg', render: (e) => (e.override.url ? shortUrl(e.override.url) : none) },
  { id: 'hidden', title: 'hidden', width: '7ch', render: (e) => (e.hidden ? <span className="c-warn">yes</span> : none) },
];

const SHORTCUT_COLS: Column<ShortcutEntry>[] = [
  { id: 'key', title: 'key', width: '5ch', render: (s) => <kbd className="cap">{s.key}</kbd> },
  { id: 'url', title: 'opens', width: 'minmax(0, 1fr)', render: (s) => address(s.url) },
];

// ---------- raw yaml ----------

interface YamlEditorProps {
  state: ConfigState;
  writable: boolean;
  onSaveYaml: (yaml: string) => Promise<SaveOutcome>;
  say: (msg: string, tone?: ToastTone) => void;
  boxRef: React.RefObject<HTMLTextAreaElement>;
  onDirty: (dirty: boolean) => void;
}

function YamlEditor({ state, writable, onSaveYaml, say, boxRef, onDirty }: YamlEditorProps) {
  const [draft, setDraft] = useState(state.yaml);
  const [base, setBase] = useState(state.yaml);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ConfigIssue[]>([]);

  const dirty = draft !== base;
  // someone else changed the file while this draft was open
  const stale = dirty && !busy && state.yaml !== base;

  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);

  // follow the file while there is nothing of ours to lose
  useEffect(() => {
    if (draft === base && state.yaml !== base) {
      setDraft(state.yaml);
      setBase(state.yaml);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.yaml]);

  const save = async () => {
    if (!dirty || busy || stale || !writable) return;
    setBusy(true);
    setError(null);
    setIssues([]);
    const result = await onSaveYaml(draft);
    setBusy(false);
    if (result.ok) {
      setBase(draft);
      say('saved the config file', 'ok');
    } else {
      setError(result.error);
      setIssues(result.issues);
    }
  };

  const revert = () => {
    setDraft(state.yaml);
    setBase(state.yaml);
    setError(null);
    setIssues([]);
  };

  return (
    <div className="yaml-editor">
      <textarea
        ref={boxRef}
        className="input yaml"
        value={draft}
        readOnly={!writable}
        spellCheck={false}
        autoCapitalize="off"
        aria-label="clearview.yaml"
        placeholder={'# nothing here yet. Example:\ngroups:\n  Media: [plex, tautulli]\nlinks:\n  - name: Router\n    url: http://192.168.1.1\n'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            void save();
          } else if (e.key === 'Escape') {
            e.currentTarget.blur();
          }
        }}
      />
      <div className="savebar">
        <SaveError error={error} issues={issues} />
        {stale && <Note tone="warn">the file changed on disk while you were editing. revert to load the new version.</Note>}
        <div className="form-actions">
          <button type="button" className="btn primary" onClick={() => void save()} disabled={!dirty || busy || stale || !writable}>
            {busy ? 'saving…' : 'save file'}
          </button>
          <button type="button" className="btn" onClick={revert} disabled={!dirty && !stale}>
            revert
          </button>
          <span className={dirty ? 'c-warn' : 'c-dim'}>{dirty ? 'unsaved changes' : 'no changes'}</span>
          <span className="c-dim keys-only">
            <kbd>ctrl-s</kbd> saves · <kbd>esc</kbd> leaves the box · <kbd>i</kbd> enters it
          </span>
        </div>
      </div>
    </div>
  );
}
