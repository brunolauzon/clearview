import fs from 'node:fs';
import path from 'node:path';
import type { ConfigIssue, FileConfig, WeatherConfig } from '@clearview/shared';
import { Document, parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { isWebAddress, shortcutKeyError } from '../../shared/shortcuts';
import { THEME_IDS } from '../../shared/themes';

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

const COLOR_HINT = 'must be a colour like "#3b82f6" (quote it: an unquoted # starts a yaml comment)';

const hexColor = z
  .string({ invalid_type_error: COLOR_HINT }) // an unquoted #3b82f6 reads as an empty value
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, COLOR_HINT)
  .transform((s) => s.toLowerCase());

const themeId = z
  .string()
  .trim()
  .refine((id) => THEME_IDS.includes(id), { message: `unknown theme (choose one of: ${THEME_IDS.join(', ')})` });

/** Yahoo-style tickers: AAPL, ^GSPC, BTC-USD, SHOP.TO, EURUSD=X */
const stockSymbol = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9.^=-]{1,15}$/, 'not a stock symbol (examples: AAPL, ^GSPC, BTC-USD, SHOP.TO)')
  .transform((s) => s.toUpperCase());

export const MAX_STOCKS = 6;

const ADDRESS_HINT = 'must be a web address starting with http:// or https://';

/** `y: https://youtube.com`: pressing the letter opens the address. */
const shortcutsSchema = z
  .record(z.string(), z.string({ invalid_type_error: ADDRESS_HINT }).trim().url(ADDRESS_HINT).refine(isWebAddress, ADDRESS_HINT))
  .superRefine((map, ctx) => {
    const seen = new Set<string>();
    for (const key of Object.keys(map)) {
      const letter = key.toLowerCase();
      const problem = shortcutKeyError(key) ?? (seen.has(letter) ? `"${letter}" is listed twice` : null);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: problem });
      seen.add(letter);
    }
  })
  .transform((map) => Object.fromEntries(Object.entries(map).map(([key, url]) => [key.toLowerCase(), url])));

const fileSchema = z
  .object({
    title: z.string().optional(),
    theme: themeId.optional(),
    background: hexColor.optional(),
    accent: hexColor.optional(),
    weather: z
      .object({ location: text, units: z.enum(['metric', 'imperial']).default('metric') })
      .strict()
      .optional(),
    stocks: z
      .array(stockSymbol)
      .max(MAX_STOCKS, `at most ${MAX_STOCKS} stock symbols`)
      .transform((list) => [...new Set(list)])
      .optional(),
    shortcuts: shortcutsSchema.optional(),
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
    ...(p.theme ? { theme: p.theme } : {}),
    ...(p.background ? { background: p.background } : {}),
    ...(p.accent ? { accent: p.accent } : {}),
    ...(p.weather ? { weather: p.weather } : {}),
    ...(p.stocks && p.stocks.length > 0 ? { stocks: p.stocks } : {}),
    ...(p.shortcuts && Object.keys(p.shortcuts).length > 0 ? { shortcuts: p.shortcuts } : {}),
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
    theme: c.theme === '' ? undefined : c.theme,
    background: c.background === '' ? undefined : c.background, // a blank colour means "use the theme's"
    accent: c.accent === '' ? undefined : c.accent,
    weather: c.weather,
    stocks: c.stocks,
    shortcuts: c.shortcuts,
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
  if (file.theme) body.theme = file.theme;
  if (file.background) body.background = file.background;
  if (file.accent) body.accent = file.accent;
  if (file.weather) body.weather = { location: file.weather.location, units: file.weather.units };
  if (file.stocks && file.stocks.length > 0) body.stocks = file.stocks;
  if (file.shortcuts && Object.keys(file.shortcuts).length > 0) body.shortcuts = file.shortcuts;
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
  /** look, from the config file: theme id plus optional #rrggbb overrides */
  theme: string | null;
  background: string | null;
  accent: string | null;
  /** header weather and stock ticker, from the config file */
  weather: WeatherConfig | null;
  stocks: string[];
  demo: boolean;
  /** demo mode only: false shows the dashboard with nothing firing */
  demoAlerts: boolean;
  /** unix socket path or tcp://host:port (e.g. a docker-socket-proxy) */
  dockerHost: string;
  disksRoot: string;
  disks: { name: string; path: string }[] | null;
  webDir: string;
  tautulli: { url: string; apiKey: string; publicUrl: string | null } | null;
  grafana: { url: string; token: string | null; publicUrl: string | null } | null;
  /** UniFi console, read through the Network Integration API */
  unifi: { url: string; apiKey: string; site: string | null; insecure: boolean } | null;
  deluge: { url: string; password: string } | null;
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
  cfg.theme = file.theme ?? null;
  cfg.background = file.background ?? null;
  cfg.accent = file.accent ?? null;
  cfg.weather = file.weather ?? null;
  cfg.stocks = file.stocks ?? [];
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
  const unifiUrl = clean(env.UNIFI_URL);
  const unifiKey = clean(env.UNIFI_API_KEY);
  const delugeUrl = clean(env.DELUGE_URL);
  const delugePassword = clean(env.DELUGE_PASSWORD);
  const flag = (v: string | undefined) => v === '1' || v === 'true';

  const cfg: AppConfig = {
    port: Number(env.PORT) || 7878,
    hostIp: clean(env.HOST_IP),
    hostName: clean(env.HOST_NAME),
    title: null,
    theme: null,
    background: null,
    accent: null,
    weather: null,
    stocks: [],
    demo: env.CLEARVIEW_DEMO === '1' || env.CLEARVIEW_DEMO === 'true',
    demoAlerts: env.CLEARVIEW_DEMO_ALERTS !== '0',
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
    unifi:
      unifiUrl && unifiKey
        ? { url: stripSlash(unifiUrl), apiKey: unifiKey, site: clean(env.UNIFI_SITE), insecure: flag(env.UNIFI_INSECURE) }
        : null,
    deluge: delugeUrl && delugePassword ? { url: stripSlash(delugeUrl), password: delugePassword } : null,
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
