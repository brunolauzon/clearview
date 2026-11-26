import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConfigIssue, ConfigState, ContainerInfo } from '@clearview/shared';
import { Box, Note } from '../components/Box';
import { Table, type Column } from '../components/Table';
import type { SaveFn, SaveOutcome } from '../lib/api';
import { containerEntries, moveGroup, removeContainer, removeGroup, removeLink, type ContainerEntry } from '../lib/configEdit';
import type { Editor } from '../lib/editor';
import { shortUrl } from '../lib/format';
import { GeneralEditor } from './General';

type Section = 'links' | 'categories' | 'containers' | 'general' | 'yaml';
const SECTIONS: Section[] = ['links', 'categories', 'containers', 'general', 'yaml'];

interface ConfigViewProps {
  state: ConfigState | null;
  /** live containers, for match counts */
  containers: ContainerInfo[];
  /** false while a form is open or the prompt has focus */
  active: boolean;
  onEdit: (editor: Editor) => void;
  onSave: SaveFn;
  onSaveYaml: (yaml: string) => Promise<SaveOutcome>;
  say: (msg: string) => void;
}

export function ConfigView({ state, containers, active, onEdit, onSave, onSaveYaml, say }: ConfigViewProps) {
  const [section, setSection] = useState<Section>('links');
  const [sel, setSel] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<number>();
  const yamlBox = useRef<HTMLTextAreaElement>(null);

  const config = state?.config;
  const links = config?.links ?? [];
  const groups = config?.groups ?? [];
  const entries = config ? containerEntries(config) : [];
  const count = section === 'links' ? links.length : section === 'categories' ? groups.length : section === 'containers' ? entries.length : 0;

  useEffect(() => {
    setSel((i) => Math.min(i, Math.max(0, count - 1)));
  }, [count]);

  const switchTo = useCallback((next: Section) => {
    setSection(next);
    setSel(0);
    setArmed(null);
  }, []);

  const writable = state?.writable ?? false;
  const isList = section === 'links' || section === 'categories' || section === 'containers';

  /** Run a change made without a form (delete, reorder) and report a refusal. Returns whether it was saved. */
  const apply = useCallback(
    async (next: Parameters<SaveFn>[0]): Promise<boolean> => {
      const result = await onSave(next);
      if (!result.ok) say(result.error);
      return result.ok;
    },
    [onSave, say],
  );

  const add = useCallback(() => {
    if (section === 'links') onEdit({ kind: 'link', index: null });
    else if (section === 'categories') onEdit({ kind: 'group', index: null });
    else if (section === 'containers') onEdit({ kind: 'container', name: null });
  }, [section, onEdit]);

  const edit = useCallback(() => {
    if (count === 0) return;
    if (section === 'links') onEdit({ kind: 'link', index: sel });
    else if (section === 'categories') onEdit({ kind: 'group', index: sel });
    else if (section === 'containers') {
      const entry = entries[sel];
      if (entry) onEdit({ kind: 'container', name: entry.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, sel, count, onEdit, state]);

  /** Delete needs the key (or button) pressed twice, so a slip does not remove anything. */
  const remove = useCallback(() => {
    if (!config || count === 0) return;
    if (!writable) return say(state?.readOnlyReason ?? 'config is read-only');
    const label = section === 'links' ? links[sel]?.name : section === 'categories' ? groups[sel]?.name : entries[sel]?.name;
    const key = `${section}:${label}`;
    if (armed !== key) {
      setArmed(key);
      say(`press d again to delete ${label}`);
      window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => setArmed(null), 3000);
      return;
    }
    setArmed(null);
    if (section === 'links') void apply(removeLink(config, sel));
    else if (section === 'categories') void apply(removeGroup(config, sel));
    else if (section === 'containers' && entries[sel]) void apply(removeContainer(config, entries[sel]!.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, count, writable, section, sel, armed, say, state, apply]);

  const move = useCallback(
    async (delta: -1 | 1) => {
      if (section !== 'categories' || !config) return;
      if (!writable) return say(state?.readOnlyReason ?? 'config is read-only');
      const to = sel + delta;
      if (to < 0 || to >= groups.length) return;
      if (await apply(moveGroup(config, sel, delta))) setSel(to);
    },
    [section, config, writable, say, state, sel, groups.length, apply],
  );

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if (t.closest('.general')) return; // the settings form handles its own keys, so Tab moves between its fields
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      let handled = true;
      switch (e.key) {
        case 'Tab':
          switchTo(SECTIONS[(SECTIONS.indexOf(section) + (e.shiftKey ? SECTIONS.length - 1 : 1)) % SECTIONS.length]!);
          break;
        case 'j':
        case 'ArrowDown':
          setSel((i) => Math.min(Math.max(0, count - 1), i + 1));
          break;
        case 'k':
        case 'ArrowUp':
          setSel((i) => Math.max(0, i - 1));
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
          if (isList) remove();
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, section, isList, count, switchTo, add, edit, remove, move]);

  if (!state || !config) {
    return (
      <Box title="config">
        <Note>connecting…</Note>
      </Box>
    );
  }

  return (
    <>
      {!state.persisted && <Note tone="warn">demo mode: changes apply right away but are not saved anywhere.</Note>}
      {!state.writable && <Note tone="warn">⚠ read-only: {state.readOnlyReason}</Note>}
      {state.warning && <Note tone="warn">⚠ {state.warning}</Note>}
      {state.loadError && (
        <Note tone="err">
          ⚠ {state.path} has errors ({state.loadError}). The last good settings stay in use until it is fixed; see the yaml tab.
        </Note>
      )}

      <Box title="config" hint={state.persisted ? state.path : 'in memory'} className="grow">
        <div className="tabs" role="tablist">
          {SECTIONS.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={s === section} className={`tab${s === section ? ' on' : ''}`} onClick={() => switchTo(s)} tabIndex={-1}>
              {s}
            </button>
          ))}
          <span className="c-faint tabs-hint">tab switches section</span>
        </div>

        {isList && (
          <div className="toolbar">
            <button type="button" className="btn" onClick={add} tabIndex={-1}>
              <kbd>a</kbd> add
            </button>
            <button type="button" className="btn" onClick={edit} disabled={count === 0} tabIndex={-1}>
              <kbd>e</kbd> edit
            </button>
            <button type="button" className="btn" onClick={remove} disabled={count === 0} tabIndex={-1}>
              <kbd>d</kbd> {section === 'containers' ? 'reset' : 'delete'}
            </button>
            {section === 'categories' && (
              <>
                <button type="button" className="btn" onClick={() => void move(-1)} disabled={sel === 0} tabIndex={-1}>
                  <kbd>K</kbd> up
                </button>
                <button type="button" className="btn" onClick={() => void move(1)} disabled={sel >= groups.length - 1} tabIndex={-1}>
                  <kbd>J</kbd> down
                </button>
              </>
            )}
          </div>
        )}

        {section === 'links' && (
          <Table
            cols={LINK_COLS}
            rows={links}
            rowKey={(l) => l.url + l.name}
            sel={sel}
            onSelect={setSel}
            empty={<Note>no links yet. Press a to add a device on your network.</Note>}
          />
        )}

        {section === 'categories' && (
          <>
            <Table
              cols={groupCols(containers, groups)}
              rows={groups}
              rowKey={(g) => g.name}
              sel={sel}
              onSelect={setSel}
              empty={<Note>no categories yet. Press a to add one, for example Media or Infrastructure.</Note>}
            />
            {groups.length > 0 && <p className="c-dim section-note">Order here is the order on the containers page. The first category that matches a container wins.</p>}
          </>
        )}

        {section === 'containers' && (
          <>
            <Table
              cols={CONTAINER_COLS}
              rows={entries}
              rowKey={(e) => e.name}
              sel={sel}
              onSelect={setSel}
              empty={<Note>nothing customised. Press a to rename, re-address, categorise or hide a container, or press e on the containers page.</Note>}
            />
            <p className="c-dim section-note">Only containers with a custom setting are listed. Hidden ones are not shown on the dashboard; reset a row to show it again.</p>
          </>
        )}

        {section === 'general' && <GeneralEditor key={state.version} state={state} onSave={onSave} say={say} />}

        {section === 'yaml' && <YamlEditor state={state} writable={writable} onSaveYaml={onSaveYaml} say={say} boxRef={yamlBox} />}
      </Box>
    </>
  );
}

// ---------- tables ----------

const none = <span className="c-faint">-</span>;

const LINK_COLS: Column<ConfigState['config']['links'][number]>[] = [
  { id: 'name', title: 'name', width: 'minmax(14ch, 2fr)', render: (l) => l.name },
  { id: 'url', title: 'address', width: 'minmax(16ch, 2fr)', render: (l) => <span className="c-accent">↗ {shortUrl(l.url)}</span> },
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
    { id: 'patterns', title: 'containers', width: 'minmax(20ch, 4fr)', min: 'md', render: (g) => <span className="c-dim">{g.containers.join(', ') || '-'}</span> },
  ];
}

const CONTAINER_COLS: Column<ContainerEntry>[] = [
  { id: 'name', title: 'container', width: 'minmax(14ch, 2fr)', render: (e) => e.name },
  { id: 'as', title: 'shown as', width: 'minmax(10ch, 1.5fr)', min: 'md', render: (e) => e.override.name ?? none },
  { id: 'group', title: 'category', width: '14ch', render: (e) => e.override.group ?? none },
  { id: 'url', title: 'webui', width: 'minmax(12ch, 2fr)', min: 'lg', render: (e) => (e.override.url ? shortUrl(e.override.url) : none) },
  { id: 'hidden', title: 'hidden', width: '7ch', render: (e) => (e.hidden ? <span className="c-warn">yes</span> : none) },
];

// ---------- raw yaml ----------

interface YamlEditorProps {
  state: ConfigState;
  writable: boolean;
  onSaveYaml: (yaml: string) => Promise<SaveOutcome>;
  say: (msg: string) => void;
  boxRef: React.RefObject<HTMLTextAreaElement>;
}

function YamlEditor({ state, writable, onSaveYaml, say, boxRef }: YamlEditorProps) {
  const [draft, setDraft] = useState(state.yaml);
  const [base, setBase] = useState(state.yaml);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ConfigIssue[]>([]);

  const dirty = draft !== base;
  // someone else changed the file while this draft was open
  const stale = state.yaml !== base;

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
      say('saved');
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
      {stale && <Note tone="warn">The file changed on disk while you were editing. Revert to load the new version.</Note>}
      <div className="form-actions">
        <button type="button" className="btn primary" onClick={() => void save()} disabled={!dirty || busy || stale || !writable}>
          {busy ? 'saving…' : 'save'}
        </button>
        <button type="button" className="btn" onClick={revert} disabled={!dirty && !stale}>
          revert
        </button>
        <span className="c-faint">{dirty ? 'unsaved changes · ' : ''}ctrl-s saves · esc leaves the box · i enters it</span>
      </div>
    </div>
  );
}
