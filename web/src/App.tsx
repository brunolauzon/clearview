import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiskInfo, LinkInfo, PlexStream, ProtectCamera } from '@clearview/shared';
import { ContainerForm, GroupForm, LinkForm, ShortcutForm } from './components/ConfigForms';
import { Header } from './components/Header';
import { ConfirmDialog } from './components/Modal';
import { Nav, type NavBadge } from './components/Nav';
import { StatusBar, type KeyHint, type PromptMode } from './components/StatusBar';
import { Toast, type ToastMessage, type ToastTone } from './components/Toast';
import { useAfter, useNow } from './hooks/useBucket';
import { useStream } from './hooks/useStream';
import { saveConfig, saveYaml, type SaveFn } from './lib/api';
import { VIEWS, viewFromHash, type ViewId } from './lib/commands';
import { shortcutEntries, shortcutFor, type ShortcutEntry } from './lib/configEdit';
import type { Editor } from './lib/editor';
import { resolveUrl } from './lib/format';
import { GLYPH } from './lib/glyphs';
import { applyLook, cacheLook } from './lib/theme';
import { containerSearchText, filterBy, SORT_KEYS, sortContainers, type SortKey } from './lib/rows';
import { AlertsView } from './views/Alerts';
import { CamerasView } from './views/Cameras';
import { ConfigView, type Section } from './views/Config';
import { ContainersView } from './views/Containers';
import { DisksView } from './views/Disks';
import { HelpView } from './views/Help';
import { HomeView } from './views/Home';
import { LinksView } from './views/Links';
import { PlexView } from './views/Plex';

const NO_GROUPS: string[] = [];
const NO_LINKS: LinkInfo[] = [];
const NO_SHORTCUTS: ShortcutEntry[] = [];

/** Which list the selection cursor moves over in each view. */
type ListKind = 'containers' | 'alerts' | 'streams' | 'disks' | 'links' | 'cameras';
const LIST_OF: Record<ViewId, ListKind | null> = {
  home: 'containers',
  containers: 'containers',
  plex: 'streams',
  alerts: 'alerts',
  disks: 'disks',
  links: 'links',
  config: null, // the config view keeps its own cursor
  cameras: 'cameras',
  help: null,
};

const CONTAINER_HINTS: KeyHint[] = [
  ['↑↓', 'move'],
  ['enter', 'open'],
  ['e', 'edit'],
  ['s', 'sort'],
  ['?', 'help'],
];
const LIST_HINTS: KeyHint[] = [
  ['↑↓', 'move'],
  ['1–8', 'views'],
  ['?', 'help'],
];
const OPEN_HINTS: KeyHint[] = [
  ['↑↓', 'move'],
  ['enter', 'open'],
  ['?', 'help'],
];

function hintsFor(view: ViewId, section: Section): KeyHint[] {
  if (view === 'home' || view === 'containers') return CONTAINER_HINTS;
  if (view === 'alerts' || view === 'links') return OPEN_HINTS;
  if (view === 'help') return [['esc', 'back home']];
  if (view !== 'config') return LIST_HINTS;
  if (section === 'general' || section === 'yaml') return [['[ ]', 'section'], ['ctrl-s', 'save'], ['esc', 'home']];
  return [
    ['↑↓', 'move'],
    ['a', 'add'],
    ['e', 'edit'],
    ['d', 'delete'],
    ['[ ]', 'section'],
  ];
}

const SORT_NAMES: Record<SortKey, string> = { group: 'category', name: 'name', state: 'state', age: 'age', cpu: 'cpu', mem: 'memory' };

const urlFor = (view: ViewId) => (view === 'home' ? location.pathname + location.search : `#${view}`);

export default function App() {
  const s = useStream();
  const now = useNow();
  // only after a moment: a blink of the connection is not worth a warning
  const offline = useAfter(!s.connected, 2500);

  const [view, setView] = useState<ViewId>(() => viewFromHash(location.hash));
  const [section, setSection] = useState<Section>('links');
  const [mode, setMode] = useState<PromptMode>('normal');
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState(0);
  const [sort, setSort] = useState<SortKey>('group');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  /** what to do if the person agrees to discard unsaved settings; null when not asking */
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const toastTimer = useRef<number>();
  const toastId = useRef(0);
  const unsaved = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const formOpen = useRef(false);
  formOpen.current = editor !== null;
  const main = useRef<HTMLElement>(null);

  const hostIp = s.meta?.hostIp ?? null;

  const say = useCallback((text: string, tone: ToastTone = 'info') => {
    setToast({ id: ++toastId.current, text, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), tone === 'err' ? 8000 : 4000);
  }, []);

  // ---------- moving around ----------
  const onDirty = useCallback((dirty: boolean) => {
    unsaved.current = dirty;
  }, []);

  /** Runs `action` at once, or after asking when it would throw unsaved settings away. */
  const guard = useCallback((action: () => void) => {
    if (unsaved.current) setLeaving(() => action);
    else action();
  }, []);

  /** a hint about the screen being left ("press d again") means nothing on the next one */
  const dropHint = useCallback(() => setToast((t) => (t?.tone === 'info' ? null : t)), []);

  const show = useCallback(
    (next: ViewId) => {
      viewRef.current = next;
      setView(next);
      setMode('normal');
      setFilter('');
      setSel(0);
      dropHint();
      if (main.current) main.current.scrollTop = 0;
      window.scrollTo(0, 0);
    },
    [dropHint],
  );

  const go = useCallback(
    (next: ViewId) => {
      if (next === viewRef.current) return setMode('normal');
      guard(() => {
        show(next);
        history.pushState(null, '', urlFor(next));
      });
    },
    [guard, show],
  );

  const goSection = useCallback(
    (next: Section) =>
      guard(() => {
        setSection(next);
        dropHint();
      }),
    [guard, dropHint],
  );

  const openConfig = useCallback(
    (next: Section) => {
      go('config');
      goSection(next);
    },
    [go, goSection],
  );

  // the browser's back and forward buttons, and addresses typed by hand
  useEffect(() => {
    const onAddress = () => {
      const next = viewFromHash(location.hash);
      if (next === viewRef.current) return;
      if (formOpen.current) {
        // the open form takes the back button as "close"; the view behind it stays
        history.pushState(null, '', urlFor(viewRef.current));
      } else if (unsaved.current) {
        // stay until the person decides, with the address saying where we are
        history.pushState(null, '', urlFor(viewRef.current));
        guard(() => {
          show(next);
          history.replaceState(null, '', urlFor(next));
        });
      } else show(next);
    };
    window.addEventListener('popstate', onAddress);
    window.addEventListener('hashchange', onAddress);
    return () => {
      window.removeEventListener('popstate', onAddress);
      window.removeEventListener('hashchange', onAddress);
    };
  }, [guard, show]);

  // closing the tab with unsaved settings gets the browser's own warning
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (unsaved.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // ---------- config editing ----------
  const config = s.config;
  // every save carries the version we last saw; the server refuses it if the file has changed since
  const save: SaveFn = useCallback((next) => saveConfig(next, config?.version ?? ''), [config?.version]);
  const saveRawYaml = useCallback((yaml: string) => saveYaml(yaml, config?.version ?? ''), [config?.version]);
  const startEdit = useCallback(
    (e: Editor) => {
      if (!config) return say('settings are still loading');
      if (!config.writable) return say(config.readOnlyReason ?? 'config is read-only', 'err');
      setEditor(e);
    },
    [config, say],
  );
  const editContainer = useCallback((name: string) => startEdit({ kind: 'container', name }), [startEdit]);

  // theme and colours come from the server's config; depend on the values, not the whole meta object,
  // so an unrelated settings change does not cancel a look being previewed in the config view
  const theme = s.meta?.theme ?? null;
  const background = s.meta?.background ?? null;
  const accent = s.meta?.accent ?? null;
  const haveMeta = s.meta !== null;
  useEffect(() => {
    if (!haveMeta) return;
    const look = { theme, background, accent };
    applyLook(look);
    cacheLook(look);
  }, [theme, background, accent, haveMeta]);

  // ---------- rows per list, filtered ----------
  const stats = s.stats?.data ?? undefined;
  // only re-sort on live numbers when the sort actually depends on them
  const sortStats = sort === 'cpu' || sort === 'mem' ? stats : undefined;
  const groupOrder = s.meta?.groups ?? NO_GROUPS;
  const containers = useMemo(
    () => sortContainers(filterBy(s.containers?.data ?? [], filter, containerSearchText), sort, sortStats, groupOrder),
    [s.containers, filter, sort, sortStats, groupOrder],
  );
  const alerts = useMemo(
    () => filterBy(s.alerts?.data ?? [], filter, (a) => `${a.name} ${a.severity} ${a.summary ?? ''}`),
    [s.alerts, filter],
  );
  const streams: PlexStream[] = useMemo(
    () => filterBy(s.plex?.data?.streams ?? [], filter, (x) => `${x.user} ${x.title} ${x.player} ${x.decision}`),
    [s.plex, filter],
  );
  const disks: DiskInfo[] = useMemo(() => filterBy(s.host?.data?.disks ?? [], filter, (d) => `${d.name} ${d.mount}`), [s.host, filter]);
  const links: LinkInfo[] = useMemo(
    () => filterBy(s.links?.data ?? [], filter, (l) => `${l.name} ${l.group} ${l.url} ${l.description ?? ''}`),
    [s.links, filter],
  );
  const cameras: ProtectCamera[] = useMemo(
    () => filterBy(s.protect?.data?.cameras ?? [], filter, (c) => `${c.name} ${c.model} ${c.state}`),
    [s.protect, filter],
  );

  const kind = LIST_OF[view];
  const lists: Record<ListKind, { shown: number; total: number }> = {
    containers: { shown: containers.length, total: s.containers?.data?.length ?? 0 },
    alerts: { shown: alerts.length, total: s.alerts?.data?.length ?? 0 },
    streams: { shown: streams.length, total: s.plex?.data?.streams.length ?? 0 },
    disks: { shown: disks.length, total: s.host?.data?.disks.length ?? 0 },
    links: { shown: links.length, total: s.links?.data?.length ?? 0 },
    cameras: { shown: cameras.length, total: s.protect?.data?.cameras.length ?? 0 },
  };
  const { shown: count, total } = kind ? lists[kind] : { shown: 0, total: 0 };

  useEffect(() => {
    setSel((i) => Math.min(i, Math.max(0, count - 1)));
  }, [count]);

  // When the rows reorder or change under the cursor (live cpu sort, a container appearing), keep the
  // same container selected instead of the same row number. Skipped when the user changed view,
  // filter or sort, which reset the selection on purpose.
  const track = useRef({ rows: containers, filter, view, sort });
  useEffect(() => {
    const t = track.current;
    if (kind === 'containers' && t.filter === filter && t.view === view && t.sort === sort) {
      const id = t.rows[sel]?.id;
      const idx = id ? containers.findIndex((c) => c.id === id) : -1;
      if (idx >= 0 && idx !== sel) setSel(idx);
    }
    track.current = { rows: containers, filter, view, sort };
    // `sel` is read, not a trigger: only a change in the rows should move the cursor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containers, filter, view, sort]);

  const open = useCallback(
    (i: number) => {
      let url: string | null = null;
      let label = '';
      if (kind === 'containers') {
        const c = containers[i];
        url = resolveUrl(c?.url ?? null, hostIp);
        label = c?.name ?? '';
      } else if (kind === 'alerts') {
        const a = alerts[i];
        url = resolveUrl(a?.url ?? null, hostIp);
        label = a?.name ?? '';
      } else if (kind === 'links') {
        const l = links[i];
        url = l?.url ?? null;
        label = l?.name ?? '';
      }
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else if (label) say(kind === 'containers' ? `${label} has no WebUI. press e to add one.` : `${label} has no address to open`);
    },
    [kind, containers, alerts, links, hostIp, say],
  );

  const changeSort = useCallback((next: SortKey) => {
    setSort(next);
    setSel(0);
  }, []);
  // a column header: sort by it, or back to categories when it is already the sort
  const sortBy = useCallback((key: string) => changeSort(sort === key ? 'group' : (key as SortKey)), [sort, changeSort]);

  const clearFilter = useCallback(() => {
    setFilter('');
    setSel(0);
  }, []);

  // ---------- keyboard ----------
  useEffect(() => {
    if (mode !== 'normal' || editor || leaving) return;
    const move = (delta: number) => setSel((i) => Math.min(Math.max(0, count - 1), Math.max(0, i + delta)));

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if (e.metaKey || e.altKey) return;
      // a focused button or link does its own thing
      if ((e.key === 'Enter' || e.key === ' ') && t.closest('a, button, summary')) return;

      // with no list to move through, leave the arrows to scroll the page
      const hasList = count > 0;
      let handled = true;
      if (e.ctrlKey) {
        if (e.key === 'd' && hasList) move(10);
        else if (e.key === 'u' && hasList) move(-10);
        else handled = false;
      } else {
        switch (e.key) {
          case 'j':
          case 'ArrowDown':
            if (hasList) move(1);
            else handled = false;
            break;
          case 'k':
          case 'ArrowUp':
            if (hasList) move(-1);
            else handled = false;
            break;
          case 'g':
          case 'Home':
            if (hasList) setSel(0);
            else handled = false;
            break;
          case 'G':
          case 'End':
            if (hasList) setSel(count - 1);
            else handled = false;
            break;
          case 'Enter':
          case 'o':
            if (kind) open(sel);
            else handled = false;
            break;
          case '/':
            if (kind) setMode('filter');
            else say('there is no list to filter here');
            break;
          case ':':
            setMode('command');
            break;
          case '?':
            go('help');
            break;
          case 'e':
            if (kind === 'containers' && containers[sel]) editContainer(containers[sel]!.rawName);
            else handled = false;
            break;
          case 's':
            if (kind === 'containers') {
              const next = SORT_KEYS[(SORT_KEYS.indexOf(sort) + 1) % SORT_KEYS.length]!;
              changeSort(next);
              say(`sorted by ${SORT_NAMES[next]}`);
            } else handled = false;
            break;
          case 'Escape':
            if (filter) clearFilter();
            else if (view !== 'home') go('home');
            else handled = false;
            break;
          default: {
            const target = VIEWS.find((v) => v.key === e.key);
            // the user's own letters; none of them can be one the cases above use
            const url = target ? null : shortcutFor(config?.config, e.key);
            if (target) go(target.id);
            else if (url) {
              if (!e.repeat) window.open(url, '_blank', 'noopener,noreferrer');
            } else handled = false;
          }
        }
      }
      if (handled) e.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, editor, leaving, count, sel, open, go, filter, view, kind, sort, say, containers, editContainer, changeSort, clearFilter, config]);

  // ---------- menu badges and the tab title ----------
  const alertList = s.alerts?.data ?? [];
  const badges: Partial<Record<ViewId, NavBadge>> = {};
  const unwell = (s.containers?.data ?? []).filter((c) => c.state === 'unhealthy' || c.state === 'restarting' || c.state === 'dead').length;
  if (unwell > 0) badges.containers = { count: unwell, tone: 'err', label: unwell === 1 ? 'container needs attention' : 'containers need attention' };
  const streaming = s.plex?.data?.streamCount ?? 0;
  if (streaming > 0) badges.plex = { count: streaming, tone: 'accent', label: streaming === 1 ? 'stream playing' : 'streams playing' };
  if (alertList.length > 0) {
    const critical = alertList.some((a) => a.severity === 'critical');
    badges.alerts = { count: alertList.length, tone: critical ? 'err' : 'warn', label: alertList.length === 1 ? 'alert firing' : 'alerts firing' };
  }
  const fullDisks = (s.host?.data?.disks ?? []).filter((d) => d.usedPct >= 90).length;
  if (fullDisks > 0) badges.disks = { count: fullDisks, tone: 'err', label: fullDisks === 1 ? 'disk nearly full' : 'disks nearly full' };
  const downCameras = (s.protect?.data?.cameras ?? []).filter((c) => c.state !== 'connected').length;
  if (downCameras > 0) badges.cameras = { count: downCameras, tone: 'warn', label: downCameras === 1 ? 'camera not connected' : 'cameras not connected' };
  const downLinks = (s.links?.data ?? []).filter((l) => l.up === false).length;
  if (downLinks > 0) badges.links = { count: downLinks, tone: 'warn', label: downLinks === 1 ? 'link down' : 'links down' };

  useEffect(() => {
    const name = s.meta?.title ? `${s.meta.title} · clearview` : 'clearview';
    // visible from another browser tab
    document.title = alertList.length > 0 ? `(${alertList.length}) ${name}` : name;
  }, [s.meta?.title, alertList.length]);

  // ---------- views ----------
  const list = { sel, onSelect: setSel, filter, onClearFilter: clearFilter };
  const containerList = {
    ...list,
    rows: containers,
    hostIp,
    sort,
    onSort: sortBy,
    onEdit: editContainer,
    stats,
    loading: !s.containers,
    error: s.containers && !s.containers.ok ? s.containers.error : null,
  };

  let body: React.ReactNode;
  switch (view) {
    case 'home':
      body = (
        <HomeView unifi={s.unifi} protect={s.protect} alerts={s.alerts} torrents={s.torrents} plex={s.plex} containers={containerList} now={now} onNavigate={go} />
      );
      break;
    case 'containers':
      body = <ContainersView {...containerList} />;
      break;
    case 'plex':
      body = <PlexView snap={s.plex} streams={streams} now={now} {...list} />;
      break;
    case 'alerts':
      body = <AlertsView snap={s.alerts} alerts={alerts} hostIp={hostIp} now={now} {...list} />;
      break;
    case 'disks':
      body = <DisksView snap={s.host} disks={disks} {...list} />;
      break;
    case 'links':
      body = <LinksView snap={s.links} links={links} onAdd={() => startEdit({ kind: 'link', index: null })} {...list} />;
      break;
    case 'cameras':
      body = <CamerasView snap={s.protect} cameras={cameras} now={now} {...list} />;
      break;
    case 'config':
      body = (
        <ConfigView
          state={s.config}
          containers={s.containers?.data ?? []}
          active={!editor && !leaving && mode === 'normal'}
          section={section}
          onSection={goSection}
          onEdit={startEdit}
          onSave={save}
          onSaveYaml={saveRawYaml}
          say={say}
          onDirty={onDirty}
        />
      );
      break;
    case 'help':
      body = <HelpView config={config?.config} onEditShortcuts={() => openConfig('shortcuts')} />;
      break;
  }

  const closeEditor = () => setEditor(null);
  const saved = (message: string) => say(message, 'ok');
  const liveContainers = s.containers?.data ?? [];

  return (
    <div className={`app${offline ? ' offline' : ''}`}>
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        skip to content
      </a>
      <Header
        host={s.host?.data ?? null}
        weather={s.weather}
        quotes={s.quotes}
        links={s.links?.data ?? NO_LINKS}
        shortcuts={config ? shortcutEntries(config.config) : NO_SHORTCUTS}
        onNavigate={go}
        onSetUpWidget={() => openConfig('general')}
        onEditShortcuts={() => openConfig('shortcuts')}
      />
      <Nav view={view} badges={badges} onNavigate={go} />
      {offline && (
        <div className="banner" role="alert">
          {GLYPH.warn}{' '}
          {s.lastAt
            ? `lost the connection to the server. what you see is from ${new Date(s.lastAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`
            : 'cannot reach the server.'}{' '}
          retrying…
        </div>
      )}
      <main id="main" className="main" tabIndex={-1} ref={main}>
        <h1 className="sr-only">{view}</h1>
        {body}
      </main>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <StatusBar
        mode={mode}
        filter={filter}
        noun={kind}
        shown={count}
        total={total}
        hints={hintsFor(view, section)}
        connected={s.connected}
        demo={s.meta?.demo ?? false}
        version={s.meta?.version ?? null}
        onActivate={setMode}
        onFilter={(v) => {
          setFilter(v);
          setSel(0);
        }}
        onClearFilter={clearFilter}
        onDone={() => setMode('normal')}
        onCommand={(target, typed) => {
          setMode('normal');
          if (target) go(target);
          else say(`no view called “${typed.trim()}”`, 'err');
        }}
      />
      {editor && config?.config && editor.kind === 'link' && (
        <LinkForm config={config.config} index={editor.index} save={save} onClose={closeEditor} onSaved={saved} />
      )}
      {editor && config?.config && editor.kind === 'group' && (
        <GroupForm config={config.config} index={editor.index} containers={liveContainers} save={save} onClose={closeEditor} onSaved={saved} />
      )}
      {editor && config?.config && editor.kind === 'shortcut' && (
        <ShortcutForm config={config.config} letter={editor.key} save={save} onClose={closeEditor} onSaved={saved} />
      )}
      {editor && config?.config && editor.kind === 'container' && (
        <ContainerForm config={config.config} name={editor.name} containers={liveContainers} save={save} onClose={closeEditor} onSaved={saved} />
      )}
      {leaving && (
        <ConfirmDialog
          title="unsaved changes"
          message="Your changes to the settings are not saved yet."
          cancel="keep editing"
          confirm="discard changes"
          onCancel={() => setLeaving(null)}
          onConfirm={() => {
            unsaved.current = false;
            setLeaving(null);
            leaving();
          }}
        />
      )}
    </div>
  );
}
