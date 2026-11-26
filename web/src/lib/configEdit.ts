import type { ConfigGroup, ConfigLink, ConfigOverride, FileConfig } from '@clearview/shared';

// Pure edits on the config document. Every function returns a new FileConfig and never mutates its input.

/** Newline- or comma-separated names to a clean list: trimmed, no blanks, no repeats, order kept. */
export function parsePatterns(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n,]/)) {
    const p = part.trim();
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

export const patternsText = (list: string[]): string => list.join('\n');

// ---------- links ----------

export function upsertLink(c: FileConfig, index: number | null, link: ConfigLink): FileConfig {
  const links = [...c.links];
  if (index === null) links.push(link);
  else links[index] = link;
  return { ...c, links };
}

export function removeLink(c: FileConfig, index: number): FileConfig {
  return { ...c, links: c.links.filter((_, i) => i !== index) };
}

// ---------- categories ----------

function withoutGroup(overrides: Record<string, ConfigOverride>, group: string, replacement?: string): Record<string, ConfigOverride> {
  const out: Record<string, ConfigOverride> = {};
  for (const [name, o] of Object.entries(overrides)) {
    if (o.group !== group) {
      out[name] = o;
      continue;
    }
    const { group: _dropped, ...rest } = o;
    const next = replacement ? { ...rest, group: replacement } : rest;
    if (Object.keys(next).length > 0) out[name] = next;
  }
  return out;
}

/** Add (index null) or replace a category. Renaming also updates containers that were pinned to the old name. */
export function upsertGroup(c: FileConfig, index: number | null, group: ConfigGroup): FileConfig {
  const groups = [...c.groups];
  let overrides = c.overrides;
  if (index === null) {
    groups.push(group);
  } else {
    const old = groups[index];
    groups[index] = group;
    if (old && old.name !== group.name) overrides = withoutGroup(c.overrides, old.name, group.name);
  }
  return { ...c, groups, overrides };
}

/** Remove a category. Containers pinned to it by name lose that pin rather than keep a heading that no longer exists. */
export function removeGroup(c: FileConfig, index: number): FileConfig {
  const removed = c.groups[index];
  return {
    ...c,
    groups: c.groups.filter((_, i) => i !== index),
    overrides: removed ? withoutGroup(c.overrides, removed.name) : c.overrides,
  };
}

/** Category order is display order. */
export function moveGroup(c: FileConfig, index: number, delta: -1 | 1): FileConfig {
  const to = index + delta;
  if (to < 0 || to >= c.groups.length) return c;
  const groups = [...c.groups];
  [groups[index], groups[to]] = [groups[to]!, groups[index]!];
  return { ...c, groups };
}

// ---------- per-container settings ----------

export interface ContainerEdit {
  displayName: string;
  url: string;
  group: string;
  hidden: boolean;
}

export function containerEdit(c: FileConfig, name: string): ContainerEdit {
  const o = c.overrides[name];
  return {
    displayName: o?.name ?? '',
    url: o?.url ?? '',
    group: o?.group ?? '',
    hidden: c.hide.includes(name) || o?.hide === true,
  };
}

/** Save a container's settings. Blank fields mean "use the default"; an entry with nothing left is removed. */
export function setContainer(c: FileConfig, name: string, edit: ContainerEdit): FileConfig {
  const prev = c.overrides[name];
  const next: ConfigOverride = {
    ...(edit.displayName.trim() ? { name: edit.displayName.trim() } : {}),
    ...(edit.url.trim() ? { url: edit.url.trim() } : {}),
    ...(prev?.icon ? { icon: prev.icon } : {}),
    ...(edit.group.trim() ? { group: edit.group.trim() } : {}),
  };
  const overrides = { ...c.overrides };
  delete overrides[name];
  if (Object.keys(next).length > 0) overrides[name] = next;
  const hide = c.hide.filter((n) => n !== name);
  if (edit.hidden) hide.push(name);
  return { ...c, hide, overrides };
}

/** Forget everything configured for a container: it goes back to discovery defaults and is shown again. */
export function removeContainer(c: FileConfig, name: string): FileConfig {
  const overrides = { ...c.overrides };
  delete overrides[name];
  return { ...c, overrides, hide: c.hide.filter((n) => n !== name) };
}

export interface ContainerEntry {
  name: string;
  override: ConfigOverride;
  hidden: boolean;
}

/** Containers that have any setting: an override, or a place on the hide list. Sorted by name. */
export function containerEntries(c: FileConfig): ContainerEntry[] {
  const names = new Set([...c.hide, ...Object.keys(c.overrides)]);
  return [...names]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((name) => ({
      name,
      override: c.overrides[name] ?? {},
      hidden: c.hide.includes(name) || c.overrides[name]?.hide === true,
    }));
}
