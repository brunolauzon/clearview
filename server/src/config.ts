import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const VERSION = '0.1.0';

const linkSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  group: z.string().default('links'),
  icon: z.string().optional(),
  description: z.string().optional(),
  check: z.enum(['http', 'tcp', 'none']).default('http'),
});

const overrideSchema = z.object({
  name: z.string().optional(),
  url: z.string().optional(),
  icon: z.string().optional(),
  group: z.string().optional(),
  hide: z.boolean().optional(),
});

const fileSchema = z.object({
  title: z.string().optional(),
  links: z.array(linkSchema).default([]),
  containers: z
    .object({
      hide: z.array(z.string()).default([]),
      overrides: z.record(z.string(), overrideSchema).default({}),
    })
    .default({}),
  disks: z.array(z.object({ name: z.string(), path: z.string() })).optional(),
});

export type LinkConfig = z.infer<typeof linkSchema>;
export type ContainerOverride = z.infer<typeof overrideSchema>;

export interface AppConfig {
  port: number;
  /** LAN address used to expand Unraid's `[IP]` token. null = let the browser decide. */
  hostIp: string | null;
  hostName: string | null;
  title: string | null;
  demo: boolean;
  /** unix socket path or tcp://host:port (e.g. a docker-socket-proxy) */
  dockerHost: string;
  disksRoot: string;
  disks: { name: string; path: string }[] | null;
  webDir: string;
  tautulli: { url: string; apiKey: string; publicUrl: string | null } | null;
  grafana: { url: string; token: string | null; publicUrl: string | null } | null;
  links: LinkConfig[];
  hide: string[];
  overrides: Record<string, ContainerOverride>;
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
  let file: z.infer<typeof fileSchema>;
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = fileSchema.safeParse(parseYaml(raw) ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
      throw new Error(`Invalid config ${configPath}:\n${issues}`);
    }
    file = parsed.data;
  } else {
    file = fileSchema.parse({});
  }

  const tautulliUrl = clean(env.TAUTULLI_URL);
  const tautulliKey = clean(env.TAUTULLI_API_KEY);
  const grafanaUrl = clean(env.GRAFANA_URL);
  const demo = env.CLEARVIEW_DEMO === '1' || env.CLEARVIEW_DEMO === 'true';

  return {
    port: Number(env.PORT) || 7878,
    hostIp: clean(env.HOST_IP),
    hostName: clean(env.HOST_NAME),
    title: file.title ?? null,
    demo,
    dockerHost: clean(env.DOCKER_HOST) ?? '/var/run/docker.sock',
    disksRoot: clean(env.DISKS_ROOT) ?? '/host/mnt',
    disks: file.disks ?? null,
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
    links: file.links,
    hide: file.containers.hide,
    overrides: file.containers.overrides,
  };
}
