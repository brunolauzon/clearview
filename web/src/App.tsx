import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiskInfo, LinkInfo, PlexStream } from '@clearview/shared';
import { ContainerForm, GroupForm, LinkForm } from './components/ConfigForms';
import { Crumbs } from './components/Crumbs';
import { Header } from './components/Header';
import { PromptBar, type PromptMode } from './components/PromptBar';
import { useNow } from './hooks/useBucket';
import { useStream } from './hooks/useStream';
import { saveConfig, saveYaml, type SaveFn } from './lib/api';
import { parseCommand, VIEWS, viewFromHash, type ViewId } from './lib/commands';
import type { Editor } from './lib/editor';
import { resolveUrl } from './lib/format';
import { applyAccent, cacheAccent } from './lib/theme';
import { containerSearchText, filterBy, SORT_KEYS, sortContainers, type SortKey } from './lib/rows';
import { AlertsView } from './views/Alerts';
import { ConfigView } from './views/Config';
import { ContainersView } from './views/Containers';
import { DisksView } from './views/Disks';
import { HelpView } from './views/Help';
import { HomeView } from './views/Home';
import { LinksView } from './views/Links';
import { PlexView } from './views/Plex';

const NO_GROUPS: string[] = [];

/** Which list the selection cursor moves over in each view. */
type ListKind = 'containers' | 'alerts' | 'streams' | 'disks' | 'links' | null;
const LIST_OF: Record<ViewId, ListKind> = {
  home: 'containers',
  containers: 'containers',
  plex: 'streams',
  alerts: 'alerts',
  disks: 'disks',
  links: 'links',
  config: null, // the config view keeps its own cursor
  help: null,
};

export default function App() {
  const s = useStream();
  const now = useNow();

  const [view, setView] = useState<ViewId>(() => viewFromHash(location.hash));
  const [mode, setMode] = useState<PromptMode>('normal');
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState(0);
  const [sort, setSort] = useState<SortKey>('group');
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number>();
  const [editor, setEditor] = useState<Editor | null>(null);

  const hostIp = s.meta?.hostIp ?? null;

  const say = useCallback((msg: string) => {
    setFlash(msg);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 2500);
  }, []);

  // ---------- config editing ----------
  const config = s.config;
  // every save carries the version we last saw; the server refuses it if the file has changed since
  const save: SaveFn = useCallback((next) => saveConfig(next, config?.version ?? ''), [config?.version]);
  const saveRawYaml = useCallback((yaml: string) => saveYaml(yaml, config?.version ?? ''), [config?.version]);
  const startEdit = useCallback(
    (e: Editor) => {
      if (!config) return say('config is still loading');
      if (!config.writable) return say(config.readOnlyReason ?? 'config is read-only');
      setEditor(e);
    },
    [config, say],
  );

  const go = useCallback((next: ViewId) => {
    setView(next);
    setFilter('');
    setSel(0);
    history.replaceState(null, '', next === 'home' ? location.pathname : `#${next}`);
  }, []);

  useEffect(() => {
    const onHash = () => setView(viewFromHash(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // the accent colour comes from the server's config; depend on the value, not the whole meta object,
  // so an unrelated settings change does not cancel a colour being previewed in the config view
  const accent = s.meta?.accent ?? null;
  const haveMeta = s.meta !== null;
  useEffect(() => {
    if (!haveMeta) return;
    applyAccent(accent);
    cacheAccent(accent);
  }, [accent, haveMeta]);

  useEffect(() => {
    document.title = s.meta?.title ? `${s.meta.title} · clearview` : 'clearview';
  }, [s.meta?.title]);

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

  const kind = LIST_OF[view];
  const count = kind === 'containers' ? containers.length : kind === 'alerts' ? alerts.length : kind === 'streams' ? streams.length : kind === 'disks' ? disks.length : kind === 'links' ? links.length : 0;

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
      else if (label) say(`${label}: no WebUI`);
    },
    [kind, containers, alerts, links, hostIp, say],
  );

  // ---------- keyboard ----------
  useEffect(() => {
    if (mode !== 'normal' || editor) return;
    const move = (delta: number) => setSel((i) => Math.min(Math.max(0, count - 1), Math.max(0, i + delta)));

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if (e.metaKey || e.altKey) return;

      let handled = true;
      if (e.ctrlKey) {
        if (e.key === 'd') move(10);
        else if (e.key === 'u') move(-10);
        else handled = false;
      } else {
        switch (e.key) {
          case 'j':
          case 'ArrowDown':
            move(1);
            break;
          case 'k':
          case 'ArrowUp':
            move(-1);
            break;
          case 'g':
          case 'Home':
            setSel(0);
            break;
          case 'G':
          case 'End':
            setSel(Math.max(0, count - 1));
            break;
          case 'Enter':
          case 'o':
            open(sel);
            break;
          case '/':
            setMode('filter');
            break;
          case ':':
            setMode('command');
            break;
          case '?':
            go('help');
            break;
          case 'e':
            if (kind === 'containers' && containers[sel]) startEdit({ kind: 'container', name: containers[sel]!.rawName });
            else handled = false;
            break;
          case 's':
            if (kind === 'containers') {
              const next = SORT_KEYS[(SORT_KEYS.indexOf(sort) + 1) % SORT_KEYS.length]!;
              setSort(next);
              say(`sort: ${next}`);
            }
            break;
          case 'Escape':
            if (filter) setFilter('');
            else if (view !== 'home') go('home');
            break;
          default: {
            const target = VIEWS.find((v) => v.key === e.key);
            if (target) go(target.id);
            else handled = false;
          }
        }
      }
      // keep Enter from also activating a focused row link: we open the selected row ourselves
      if (handled) e.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, editor, count, sel, open, go, filter, view, kind, sort, say, containers, startEdit]);

  // ---------- prompt ----------
  const onSubmit = (value: string) => {
    if (mode === 'command') {
      const target = parseCommand(value);
      if (target) go(target);
      else if (value.trim()) say(`unknown command: ${value.trim()}`);
    } else {
      setFilter(value);
      setSel(0);
    }
    setMode('normal');
  };

  const onCancel = () => {
    if (mode === 'filter') setFilter('');
    setMode('normal');
  };

  const alertList = s.alerts?.data ?? [];
  const common = { sel, onSelect: setSel, filter };

  let body: React.ReactNode;
  switch (view) {
    case 'home':
      body = (
        <HomeView
          host={s.host}
          alerts={s.alerts}
          plex={s.plex}
          containers={containers}
          containersSnap={s.containers}
          sel={sel}
          onSelect={setSel}
          hostIp={hostIp}
          sort={sort}
          stats={stats}
          filter={filter}
          now={now}
        />
      );
      break;
    case 'containers':
      body = (
        <ContainersView
          rows={containers}
          hostIp={hostIp}
          sort={sort}
          stats={stats}
          loading={!s.containers}
          error={s.containers && !s.containers.ok ? s.containers.error : null}
          {...common}
        />
      );
      break;
    case 'plex':
      body = <PlexView snap={s.plex} streams={streams} now={now} tautulliUrl={s.meta?.tautulliUrl ?? null} {...common} />;
      break;
    case 'alerts':
      body = <AlertsView snap={s.alerts} alerts={alerts} hostIp={hostIp} now={now} {...common} />;
      break;
    case 'disks':
      body = <DisksView snap={s.host} disks={disks} {...common} />;
      break;
    case 'links':
      body = <LinksView snap={s.links} links={links} {...common} />;
      break;
    case 'config':
      body = (
        <ConfigView
          state={s.config}
          containers={s.containers?.data ?? []}
          active={!editor && mode === 'normal'}
          onEdit={startEdit}
          onSave={save}
          onSaveYaml={saveRawYaml}
          say={say}
        />
      );
      break;
    case 'help':
      body = <HelpView />;
      break;
  }

  const closeEditor = () => setEditor(null);
  const saved = () => say('saved');
  const liveContainers = s.containers?.data ?? [];

  return (
    <div className="app">
      <Header
        host={s.host?.data ?? null}
        alertCount={alertList.length}
        criticalCount={alertList.filter((a) => a.severity === 'critical').length}
        streamCount={s.plex?.data?.streamCount ?? 0}
        onNavigate={go}
        onPrompt={setMode}
      />
      <main className="main">{body}</main>
      <Crumbs view={view} filter={filter} connected={s.connected} demo={s.meta?.demo ?? false} version={s.meta?.version ?? null} />
      <PromptBar
        mode={mode}
        initial={mode === 'filter' ? filter : ''}
        flash={flash}
        onChange={(v) => {
          setFilter(v);
          setSel(0);
        }}
        onSubmit={onSubmit}
        onCancel={onCancel}
        onActivate={setMode}
      />
      {editor && config?.config && editor.kind === 'link' && (
        <LinkForm config={config.config} index={editor.index} save={save} onClose={closeEditor} onSaved={saved} />
      )}
      {editor && config?.config && editor.kind === 'group' && (
        <GroupForm config={config.config} index={editor.index} containers={liveContainers} save={save} onClose={closeEditor} onSaved={saved} />
      )}
      {editor && config?.config && editor.kind === 'container' && (
        <ContainerForm config={config.config} name={editor.name} containers={liveContainers} save={save} onClose={closeEditor} onSaved={saved} />
      )}
    </div>
  );
}
