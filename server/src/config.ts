import fs from 'node:fs';
import path from 'node:path';
import type { ConfigIssue, FileConfig } from '@clearview/shared';
import { Document, parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const VERSION = '0.1.0';

// ---------- the config file (clearview.yaml) ----------
// Strict on purpose: a typo like `link:` should be an error, not a silently ignored section.

const text = z.string().trim().min(1);

const linkSchema = z
  .object({
    name: text,
    url: z.string().trim().url(),
    group: text.default('links'),
    icon: z.string().optional(),
    description: z.string().optional(),
    check: z.enum(['http', 'tcp', 'none']).default('http'),
  })
  .strict();

const overrideSchema = z
  .object({
    name: z.string().optional(),
    url: z.string().optional(),
    icon: z.string().optional(),
    group: z.string().optional(),
    hide: z.boolean().optional(),
  })
  .strict();

const ACCENT_HINT = 'must be a colour like "#3b82f6" (quote it: an unquoted # starts a yaml comment)';

const accentColor = z
  .string({ invalid_type_error: ACCENT_HINT }) // an unquoted #3b82f6 reads as an empty value
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, ACCENT_HINT)
  .transform((s) => s.toLowerCase());

const fileSchema = z
  .object({
    title: z.string().optional(),
    accent: accentColor.optional(),
    links: z.array(linkSchema).default([]),
    // category name -> container names (`*` wildcard). Key order is the display order.
    groups: z.record(z.string(), z.array(text)).default({}),
    containers: z
      .object({
        hide: z.array(text).default([]),
        overrides: z.record(z.string(), overrideSchema).default({}),
      })
      .strict()
      .default({}),
    disks: z.array(z.object({ name: text, path: text }).strict()).optional(),
  })
  .strict();

export type LinkConfig = z.infer<typeof linkSchema>;
export type ContainerOverride = z.infer<typeof overrideSchema>;

/** A container category and the name patterns that belong to it. */
export interface GroupRule {
  name: string;
  containers: string[];
}

export function emptyFileConfig(): FileConfig {
  return { links: [], groups: [], hide: [], overrides: {} };
}

function fromParsed(p: z.infer<typeof fileSchema>): FileConfig {
  return {
    ...(p.title ? { title: p.title } : {}),
    ...(p.accent ? { accent: p.accent } : {}),
    links: p.links,
    groups: Object.entries(p.groups).map(([name, containers]) => ({ name, containers })),
    hide: p.containers.hide,
    overrides: p.containers.overrides,
    ...(p.disks ? { disks: p.disks } : {}),
  };
}

export type ParseResult = { ok: true; file: FileConfig } | { ok: false; issues: ConfigIssue[] };

function validateShape(data: unknown): ParseResult {
  const parsed = fileSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
    };
  }
  return { ok: true, file: fromParsed(parsed.data) };
}

/** Parse and validate the text of a clearview.yaml. Empty text is a valid, empty config. */
export function parseFileText(source: string): ParseResult {
  let data: unknown;
  try {
    data = parseYaml(source) ?? {};
  } catch (err) {
    return { ok: false, issues: [{ path: '(yaml)', message: err instanceof Error ? err.message : String(err) }] };
  }
  return validateShape(data);
}

/**
 * Validate a config coming from the UI (untrusted JSON). Categories arrive as an ordered array and
 * are turned into the file's map form so the same schema checks both paths.
 */
export function validateFileConfig(input: unknown): ParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, issues: [{ path: '(root)', message: 'config must be an object' }] };
  }
  const c = input as Record<string, unknown>;
  const issues: ConfigIssue[] = [];

  const groups = new Map<string, unknown>();
  if (c.groups !== undefined) {
    if (!Array.isArray(c.groups)) {
      issues.push({ path: 'groups', message: 'categories must be a list' });
    } else {
      c.groups.forEach((g: unknown, i) => {
        const entry = (g ?? {}) as { name?: unknown; containers?: unknown };
        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!name) issues.push({ path: `groups.${i}.name`, message: 'category name is required' });
        else if (groups.has(name)) issues.push({ path: `groups.${i}.name`, message: `duplicate category "${name}"` });
        else groups.set(name, entry.containers ?? []);
      });
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  return validateShape({
    title: c.title,
    accent: c.accent === '' ? undefined : c.accent, // a blank colour means "use the default"
    links: c.links,
    groups: Object.fromEntries(groups),
    containers: { hide: c.hide, overrides: c.overrides },
    disks: c.disks,
  });
}

const HEADER = [
  ' Managed by the clearview UI (open it with :config).',
  ' Comments added by hand are lost the next time you save from the UI;',
  ' the previous version is kept next to this file as clearview.yaml.bak.',
].join('\n');

const present = (s: string | undefined): string | undefined => (s && s.trim() ? s : undefined);

/** Serialise a config to YAML text, omitting empty sections and default values. */
export function toYamlText(file: FileConfig): string {
  const body: Record<string, unknown> = {};
  if (file.title) body.title = file.title;
  if (file.accent) body.accent = file.accent;
  if (file.groups.length > 0) {
    body.groups = Object.fromEntries(file.groups.map((g) => [g.name, g.containers]));
  }
  if (file.links.length > 0) {
    body.links = file.links.map((l) => ({
      name: l.name,
      url: l.url,
      group: l.group,
      ...(present(l.description) ? { description: l.description } : {}),
      ...(present(l.icon) ? { icon: l.icon } : {}),
      ...(l.check !== 'http' ? { check: l.check } : {}),
    }));
  }
  const containers: Record<string, unknown> = {};
  if (file.hide.length > 0) containers.hide = file.hide;
  const overrides = Object.fromEntries(
    Object.entries(file.overrides)
      .map(([name, o]) => [
        name,
        {
          ...(present(o.name) ? { name: o.name } : {}),
          ...(present(o.url) ? { url: o.url } : {}),
          ...(present(o.icon) ? { icon: o.icon } : {}),
          ...(present(o.group) ? { group: o.group } : {}),
          ...(o.hide ? { hide: true } : {}),
        },
      ] as const)
      .filter(([, o]) => Object.keys(o).length > 0),
  );
  if (Object.keys(overrides).length > 0) containers.overrides = overrides;
  if (Object.keys(containers).length > 0) body.containers = containers;
  if (file.disks && file.disks.length > 0) body.disks = file.disks;

  const doc = new Document(body);
  doc.commentBefore = HEADER;
  return doc.toString({ lineWidth: 0 });
}

// ---------- the running config (environment + file) ----------

export interface AppConfig {
  port: number;
  /** LAN address used to expand Unraid's `[IP]` token. null = let the browser decide. */
  hostIp: string | null;
  hostName: string | null;
  title: string | null;
  /** preferred accent colour (#rrggbb) from the config file */
  accent: string | null;
  demo: boolean;
  /** unix socket path or tcp://host:port (e.g. a docker-socket-proxy) */
  dockerHost: string;
  disksRoot: string;
  disks: { name: string; path: string }[] | null;
  webDir: string;
  tautulli: { url: string; apiKey: string; publicUrl: string | null } | null;
  grafana: { url: string; token: string | null; publicUrl: string | null } | null;
  links: LinkConfig[];
  /** categories in display order */
  groups: GroupRule[];
  hide: string[];
  overrides: Record<string, ContainerOverride>;
  /** where the editable config lives, and whether the UI may change it */
  configPath: string;
  configReadOnly: boolean;
}

/** Copy the editable part of the config into the running config. Everything reads these fields live. */
export function applyFileConfig(cfg: AppConfig, file: FileConfig): void {
  cfg.title = file.title ?? null;
  cfg.accent = file.accent ?? null;
  cfg.links = file.links;
  cfg.groups = file.groups;
  cfg.hide = file.hide;
  cfg.overrides = file.overrides;
  cfg.disks = file.disks ?? null;
}

function clean(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function stripSlash(u: string): string {
  return u.replace(/\/+$/, '');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const configPath = clean(env.CONFIG_PATH) ?? '/config/clearview.yaml';
  let file = emptyFileConfig();
  if (fs.existsSync(configPath)) {
    const result = parseFileText(fs.readFileSync(configPath, 'utf8'));
    if (!result.ok) {
      const issues = result.issues.map((i) => `  ${i.path}: ${i.message}`).join('\n');
      throw new Error(`Invalid config ${configPath}:\n${issues}`);
    }
    file = result.file;
  }

  const tautulliUrl = clean(env.TAUTULLI_URL);
  const tautulliKey = clean(env.TAUTULLI_API_KEY);
  const grafanaUrl = clean(env.GRAFANA_URL);

  const cfg: AppConfig = {
    port: Number(env.PORT) || 7878,
    hostIp: clean(env.HOST_IP),
    hostName: clean(env.HOST_NAME),
    title: null,
    accent: null,
    demo: env.CLEARVIEW_DEMO === '1' || env.CLEARVIEW_DEMO === 'true',
    dockerHost: clean(env.DOCKER_HOST) ?? '/var/run/docker.sock',
    disksRoot: clean(env.DISKS_ROOT) ?? '/host/mnt',
    disks: null,
    webDir: clean(env.WEB_DIR) ?? path.resolve(import.meta.dirname, '../../web/dist'),
    tautulli:
      tautulliUrl && tautulliKey
        ? {
            url: stripSlash(tautulliUrl),
            apiKey: tautulliKey,
            publicUrl: clean(env.TAUTULLI_PUBLIC_URL) ? stripSlash(clean(env.TAUTULLI_PUBLIC_URL)!) : null,
          }
        : null,
    grafana: grafanaUrl
      ? {
          url: stripSlash(grafanaUrl),
          token: clean(env.GRAFANA_TOKEN),
          publicUrl: clean(env.GRAFANA_PUBLIC_URL) ? stripSlash(clean(env.GRAFANA_PUBLIC_URL)!) : null,
        }
      : null,
    links: [],
    groups: [],
    hide: [],
    overrides: {},
    configPath,
    configReadOnly: env.CONFIG_READONLY === '1' || env.CONFIG_READONLY === 'true',
  };
  applyFileConfig(cfg, file);
  return cfg;
}
