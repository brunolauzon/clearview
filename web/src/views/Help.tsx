import type { FileConfig } from '@clearview/shared';
import { Box } from '../components/Box';
import { shortcutEntries } from '../lib/configEdit';
import { shortUrl } from '../lib/format';

const KEYS: [string, string][] = [
  ['j / k, ↓ / ↑', 'move selection'],
  ['g / G', 'jump to top / bottom'],
  ['ctrl-d / ctrl-u', 'half page down / up'],
  ['enter, o', 'open the selected WebUI (new tab)'],
  ['/', 'filter rows (esc clears)'],
  [':', 'command prompt (tab completes)'],
  ['e', 'edit the selected container: name, address, category, hide'],
  ['s', 'cycle container sort: category, name, state, age, cpu, mem'],
  ['1 – 8', 'home, containers, plex, alerts, disks, links, config, cameras'],
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
  [':config  :cfg', 'edit links, categories, containers, shortcuts and the yaml'],
  [':cameras  :cam', 'UniFi Protect cameras and recent events'],
];

const CONFIG_KEYS: [string, string][] = [
  ['tab / shift-tab', 'switch section: links, categories, containers, shortcuts, general, yaml'],
  ['a', 'add'],
  ['e, enter', 'edit the selected row'],
  ['d (twice)', 'delete the row, or reset a container'],
  ['K / J', 'move a category up or down (order is display order)'],
  ['i', 'start typing in the yaml box (esc leaves it, ctrl-s saves)'],
];

const LABELS: [string, string][] = [
  ['clearview.url', 'override the WebUI address'],
  ['clearview.name', 'display name'],
  ['clearview.hide=true', 'hide this container'],
  ['clearview.group', 'category (beats the groups: list in clearview.yaml)'],
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

export function HelpView({ config }: { config: FileConfig | undefined }) {
  const mine = config ? shortcutEntries(config) : [];
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
      <Box title="my shortcuts" count={mine.length}>
        <Rows rows={mine.map((s) => [s.key, shortUrl(s.url)])} />
        <p className="c-dim help-note">
          {mine.length > 0 ? 'Each letter opens its site in a new tab.' : 'None yet: a letter can open a website, for example y for youtube.com.'}{' '}
          Add or change them in <code>:config</code>, shortcuts.
        </p>
      </Box>
      <Box title="config view">
        <Rows rows={CONFIG_KEYS} />
      </Box>
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
