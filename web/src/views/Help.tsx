import { Box } from '../components/Box';

const KEYS: [string, string][] = [
  ['j / k, ↓ / ↑', 'move selection'],
  ['g / G', 'jump to top / bottom'],
  ['ctrl-d / ctrl-u', 'half page down / up'],
  ['enter, o', 'open the selected WebUI (new tab)'],
  ['/', 'filter rows (esc clears)'],
  [':', 'command prompt (tab completes)'],
  ['s', 'cycle container sort: name, state, age'],
  ['1 – 6', 'home, containers, plex, alerts, disks, links'],
  ['?', 'this help'],
  ['esc', 'clear filter, then back to home'],
];

const COMMANDS: [string, string][] = [
  [':home', 'overview'],
  [':containers  :c', 'docker containers'],
  [':plex  :p', 'streams and library stats (Tautulli)'],
  [':alerts  :a', 'Grafana alerts'],
  [':disks  :d', 'array and cache usage'],
  [':links  :l', 'other devices on your network'],
];

const LABELS: [string, string][] = [
  ['clearview.url', 'override the WebUI address'],
  ['clearview.name', 'display name'],
  ['clearview.hide=true', 'hide this container'],
  ['clearview.group', 'group name'],
  ['net.unraid.docker.webui', 'read automatically (Unraid sets it)'],
];

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="help-rows">
      {rows.map(([k, v]) => (
        <div key={k} className="help-row">
          <span className="c-accent help-k">{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

export function HelpView() {
  return (
    <div className="stack">
      <div className="cols2">
        <Box title="keys">
          <Rows rows={KEYS} />
        </Box>
        <Box title="commands">
          <Rows rows={COMMANDS} />
        </Box>
      </div>
      <Box title="container labels">
        <Rows rows={LABELS} />
        <p className="c-dim help-note">
          Containers get their WebUI link from Unraid&apos;s own label, so anything installed from Community Apps works with no setup.
          Set <code>HOST_IP</code> if you open this dashboard by a DNS name that is not the server&apos;s address.
        </p>
      </Box>
    </div>
  );
}
