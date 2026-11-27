import { Fragment } from 'react';
import type { FileConfig } from '@clearview/shared';
import { Box } from '../components/Box';
import { VIEWS } from '../lib/commands';
import { shortcutEntries } from '../lib/configEdit';
import { shortUrl } from '../lib/format';

/** [keys, what they do]; each key in the first part is drawn as a key cap */
type Row = [string[], string];

const KEYS: Row[] = [
  [['j', 'k', '↓', '↑'], 'move the selection'],
  [['g', 'G'], 'jump to the top or bottom'],
  [['ctrl-d', 'ctrl-u'], 'half a page down or up'],
  [['enter', 'o'], 'open the selected WebUI in a new tab'],
  [['/'], 'filter the list'],
  [[':'], 'go to a view by name'],
  [['e'], 'edit the selected container: name, address, category, hide'],
  [['s'], 'cycle container sort: category, name, state, age, cpu, mem'],
  [['1', '…', '8'], 'jump to a view (the numbers are in the menu)'],
  [['?'], 'this help'],
  [['esc'], 'close, clear the filter, or go back home'],
];

const MOUSE: Row[] = [
  [['click a row'], 'open its WebUI (middle-click and ctrl-click work too)'],
  [['click a column'], 'sort containers by it; click it again to group by category'],
  [['edit'], 'at the end of a container row: change how it appears'],
  [['click a box title'], 'open that view'],
  [['tab'], 'move between buttons, menu and lists'],
];

const CONFIG_KEYS: Row[] = [
  [['[', ']', '←', '→'], 'switch section: links, categories, containers, shortcuts, general, yaml'],
  [['a'], 'add'],
  [['e', 'enter'], 'edit the selected row (or double click it)'],
  [['d', 'd'], 'press twice to delete the row, or to reset a container'],
  [['K', 'J'], 'move a category up or down (order is display order)'],
  [['ctrl-s'], 'save, in general and yaml'],
  [['i'], 'start typing in the yaml box (esc leaves it)'],
];

const LABELS: Row[] = [
  [['clearview.url'], 'override the WebUI address'],
  [['clearview.name'], 'display name'],
  [['clearview.hide=true'], 'hide this container'],
  [['clearview.group'], 'category (beats the groups: list in clearview.yaml)'],
  [['net.unraid.docker.webui'], 'read automatically (Unraid sets it)'],
];

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="help-rows">
      {rows.map(([keys, what]) => (
        <Fragment key={keys.join(' ') + what}>
          <dt>
            {keys.map((k, i) => (
              <kbd key={i} className="cap">
                {k}
              </kbd>
            ))}
          </dt>
          <dd>{what}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function HelpView({ config, onEditShortcuts }: { config: FileConfig | undefined; onEditShortcuts: () => void }) {
  const mine = config ? shortcutEntries(config) : [];
  const commands: Row[] = VIEWS.map((v) => [[`:${v.id}`, ...(v.aliases[0] && v.aliases[0] !== '?' ? [`:${v.aliases[0]}`] : [])], v.about]);
  return (
    <div className="stack">
      <div className="cols2">
        <Box title="keyboard">
          <Rows rows={KEYS} />
        </Box>
        <Box title="commands">
          <Rows rows={commands} />
        </Box>
      </div>
      <div className="cols2">
        <Box title="mouse and touch">
          <Rows rows={MOUSE} />
        </Box>
        <Box title="settings keys">
          <Rows rows={CONFIG_KEYS} />
        </Box>
      </div>
      <div className="cols2">
        <Box title="my shortcuts" count={mine.length}>
          {mine.length > 0 && <Rows rows={mine.map((s) => [[s.key], shortUrl(s.url)])} />}
          <p className="c-dim help-note">
            {mine.length > 0 ? 'Press a letter to open its site in a new tab.' : 'None yet: a letter can open a website, for example y for youtube.com.'}
          </p>
          <button type="button" className="btn" onClick={onEditShortcuts}>
            {mine.length > 0 ? 'change shortcuts' : 'add a shortcut'}
          </button>
        </Box>
        <Box title="container labels">
          <Rows rows={LABELS} />
          <p className="c-dim help-note">
            Containers get their WebUI link from Unraid&apos;s own label, so anything installed from Community Apps works with no setup. Set <code>HOST_IP</code>{' '}
            if you open this dashboard by a DNS name that is not the server&apos;s address.
          </p>
        </Box>
      </div>
    </div>
  );
}
