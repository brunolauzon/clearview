import { useState, type FormEvent } from 'react';
import type { ConfigLink, ContainerInfo, FileConfig, LinkCheck } from '@clearview/shared';
import type { SaveFn } from '../lib/api';
import { RESERVED_KEYS } from '../../../shared/shortcuts';
import {
  containerEdit,
  lanAddress,
  parsePatterns,
  patternsText,
  setContainer,
  setShortcut,
  shortcutProblem,
  upsertGroup,
  upsertLink,
  webAddress,
} from '../lib/configEdit';
import { Field, FormActions, useSaver } from './Form';
import { Modal } from './Modal';

interface FormBase {
  config: FileConfig;
  save: SaveFn;
  onClose: () => void;
  /** called with a short description of what was saved */
  onSaved: (message: string) => void;
}

// ---------- link ----------

export function LinkForm({ config, index, save, onClose, onSaved }: FormBase & { index: number | null }) {
  const existing = index === null ? undefined : config.links[index];
  const [name, setName] = useState(existing?.name ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [group, setGroup] = useState(existing?.group ?? '');
  const [check, setCheck] = useState<LinkCheck>(existing?.check ?? 'http');
  const [note, setNote] = useState(existing?.description ?? '');
  const saver = useSaver(save, () => {
    onSaved(existing ? `saved ${name.trim()}` : `added ${name.trim()}`);
    onClose();
  });
  const groups = [...new Set(config.links.map((l) => l.group))];
  const dirty =
    name !== (existing?.name ?? '') ||
    url !== (existing?.url ?? '') ||
    group !== (existing?.group ?? '') ||
    check !== (existing?.check ?? 'http') ||
    note !== (existing?.description ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const link: ConfigLink = {
      name: name.trim(),
      url: lanAddress(url),
      group: group.trim() || 'links',
      check,
      ...(note.trim() ? { description: note.trim() } : {}),
      ...(existing?.icon ? { icon: existing.icon } : {}),
    };
    void saver.run(upsertLink(config, index, link));
  };

  return (
    <Modal title={existing ? 'edit link' : 'add link'} onClose={onClose} dirty={dirty}>
      <form onSubmit={submit}>
        <Field label="name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Router" />
        </Field>
        <Field label="address" hint="192.168.1.1 is enough: http:// is added. Type https:// if the device uses it.">
          <input className="input" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="192.168.1.1" autoCapitalize="none" spellCheck={false} />
        </Field>
        <Field label="group" hint="links with the same group are listed together">
          <input className="input" list="cv-link-groups" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="network" />
          <datalist id="cv-link-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
        <Field label="status check" hint="http: any web response means up. tcp: the port accepts a connection. none: just a link.">
          <select className="input" value={check} onChange={(e) => setCheck(e.target.value as LinkCheck)}>
            <option value="http">http</option>
            <option value="tcp">tcp</option>
            <option value="none">none</option>
          </select>
        </Field>
        <Field label="note (optional)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dream Machine" />
        </Field>
        <FormActions saver={saver} onCancel={onClose} saveLabel={existing ? 'save changes' : 'add link'} />
      </form>
    </Modal>
  );
}

// ---------- letter shortcut ----------

export function ShortcutForm({ config, letter, save, onClose, onSaved }: FormBase & { letter: string | null }) {
  const [key, setKey] = useState(letter ?? '');
  const [url, setUrl] = useState((letter && config.shortcuts?.[letter]) || '');
  const saver = useSaver(save, () => {
    onSaved(`${key.toLowerCase()} now opens ${webAddress(url)}`);
    onClose();
  });
  const problem = key ? shortcutProblem(config, key, letter) : null;
  const dirty = key !== (letter ?? '') || url !== ((letter && config.shortcuts?.[letter]) || '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!problem) void saver.run(setShortcut(config, letter, key, webAddress(url)));
  };

  return (
    <Modal title={letter ? 'edit shortcut' : 'add shortcut'} onClose={onClose} dirty={dirty}>
      <form onSubmit={submit}>
        <Field label="key" error={problem} hint={`one letter. The dashboard already uses ${Object.keys(RESERVED_KEYS).join(' ')}`}>
          <input className="input" value={key} onChange={(e) => setKey(e.target.value.trim())} maxLength={1} required placeholder="y" autoCapitalize="none" />
        </Field>
        <Field label="address" hint="opens in a new tab. youtube.com is enough: https:// is added">
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="youtube.com" autoCapitalize="none" spellCheck={false} />
        </Field>
        <FormActions saver={saver} onCancel={onClose} saveLabel={letter ? 'save changes' : 'add shortcut'} />
      </form>
    </Modal>
  );
}

// ---------- category ----------

export function GroupForm({
  config,
  index,
  containers,
  save,
  onClose,
  onSaved,
}: FormBase & { index: number | null; containers: ContainerInfo[] }) {
  const existing = index === null ? undefined : config.groups[index];
  const [name, setName] = useState(existing?.name ?? '');
  const [text, setText] = useState(patternsText(existing?.containers ?? []));
  const saver = useSaver(save, () => {
    onSaved(existing ? `saved ${name.trim()}` : `added ${name.trim()}`);
    onClose();
  });
  const dirty = name !== (existing?.name ?? '') || text !== patternsText(existing?.containers ?? []);

  const listed = new Set(parsePatterns(text));
  // containers with no category yet come first; ones already in another category are dimmed
  const suggestions = containers
    .filter((c) => !listed.has(c.rawName))
    .sort((a, b) => Number(a.group !== null) - Number(b.group !== null) || a.rawName.localeCompare(b.rawName));

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    void saver.run(upsertGroup(config, index, { name: name.trim(), containers: parsePatterns(text) }));
  };

  return (
    <Modal title={existing ? 'edit category' : 'add category'} onClose={onClose} dirty={dirty}>
      <form onSubmit={submit}>
        <Field label="name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Media" />
        </Field>
        <Field label="containers" hint="one container name per line. * matches anything, so *arr covers sonarr and radarr.">
          <textarea
            className="input"
            rows={7}
            value={text}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
            }}
            placeholder={'plex\ntautulli\n*arr'}
          />
        </Field>
        {suggestions.length > 0 && (
          <div className="chips" role="group" aria-label="containers you can add">
            <span className="c-dim">add:</span>
            {suggestions.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip${c.group ? ' assigned' : ''}`}
                title={c.group ? `now in ${c.group}` : 'not in a category yet'}
                onClick={() => setText((t) => (t.trim() ? `${t.replace(/\s+$/, '')}\n` : '') + c.rawName)}
              >
                {c.rawName}
              </button>
            ))}
          </div>
        )}
        <FormActions saver={saver} onCancel={onClose} saveLabel={existing ? 'save changes' : 'add category'} />
      </form>
    </Modal>
  );
}

// ---------- container ----------

export function ContainerForm({
  config,
  name: initialName,
  containers,
  save,
  onClose,
  onSaved,
}: FormBase & { name: string | null; containers: ContainerInfo[] }) {
  const adding = initialName === null;
  const start = containerEdit(config, initialName ?? '');
  const [name, setName] = useState(initialName ?? '');
  const [displayName, setDisplayName] = useState(start.displayName);
  const [url, setUrl] = useState(start.url);
  const [group, setGroup] = useState(start.group);
  const [hidden, setHidden] = useState(start.hidden);
  const saver = useSaver(save, () => {
    onSaved(hidden ? `${name.trim()} is now hidden. Show it again in config, containers.` : `saved ${name.trim()}`);
    onClose();
  });
  const dirty =
    name !== (initialName ?? '') || displayName !== start.displayName || url !== start.url || group !== start.group || hidden !== start.hidden;

  const live = containers.find((c) => c.rawName === name.trim());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void saver.run(setContainer(config, name.trim(), { displayName, url, group, hidden }));
  };

  return (
    <Modal title={adding ? 'add container settings' : `edit ${initialName}`} onClose={onClose} dirty={dirty}>
      <form onSubmit={submit}>
        <Field label="container" hint={adding ? 'the container name as Docker knows it' : undefined}>
          <input
            className="input"
            list="cv-container-names"
            value={name}
            readOnly={!adding}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="plex"
          />
          <datalist id="cv-container-names">
            {containers.map((c) => (
              <option key={c.id} value={c.rawName} />
            ))}
          </datalist>
        </Field>
        <Field label="shown as" hint="leave blank to use the container name">
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={live?.rawName ?? name} />
        </Field>
        <Field label="WebUI address" hint="leave blank to use the one found automatically. [IP] stands for your server's address.">
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={live?.url ?? 'http://[IP]:8080/'} />
        </Field>
        <Field
          label="category"
          hint={live ? `currently: ${live.group ?? 'none'}. Set one here to override the category lists.` : 'overrides the category lists'}
        >
          <input className="input" list="cv-category-names" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Media" />
          <datalist id="cv-category-names">
            {config.groups.map((g) => (
              <option key={g.name} value={g.name} />
            ))}
          </datalist>
        </Field>
        <label className="check">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          <span>hide this container from the dashboard</span>
        </label>
        <FormActions saver={saver} onCancel={onClose} />
      </form>
    </Modal>
  );
}
