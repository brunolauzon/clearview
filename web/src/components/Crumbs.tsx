import type { ViewId } from '../lib/commands';

interface CrumbsProps {
  view: ViewId;
  filter: string;
  connected: boolean;
  demo: boolean;
  version: string | null;
}

export function Crumbs({ view, filter, connected, demo, version }: CrumbsProps) {
  return (
    <footer className="crumbs">
      <span className="crumb on">&lt;{view}&gt;</span>
      {filter && <span className="crumb">&lt;/{filter}&gt;</span>}
      <span className="spacer" />
      {demo && <span className="c-accent">demo data</span>}
      <span className={connected ? 'c-ok' : 'c-err'}>{connected ? '● live' : '○ reconnecting…'}</span>
      {version && <span className="c-dim">clearview v{version}</span>}
    </footer>
  );
}
