import fs from 'node:fs';
import Fastify, { LogController } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { AlertInfo, ContainerInfo, ContainerStats, HostStats, LinkInfo, Meta, PlexData } from '@clearview/shared';
import { loadConfig, VERSION } from './config';
import { ConfigStore } from './configStore';
import { Hub, Topic } from './hub';
import { registerConfigRoutes } from './routes/config';
import { collectContainers, DockerClient } from './sources/docker';
import { HostCollector } from './sources/host';
import { StatsCollector } from './sources/stats';
import { fetchAlerts } from './sources/grafana';
import { TautulliSource } from './sources/tautulli';
import { LinkProber } from './sources/links';
import { DEMO_FILE_CONFIG, demoAlerts, demoContainers, demoHost, demoLinks, demoPlex, demoStats } from './sources/demo';
import { errMsg } from './util';

let cfg: ReturnType<typeof loadConfig>;
try {
  cfg = loadConfig();
} catch (err) {
  console.error(errMsg(err));
  process.exit(1);
}

// Per-request logging is off: the Docker healthcheck and the UI's SSE stream would flood the log.
const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  logController: new LogController({ disableRequestLogging: true }),
});
const hub = new Hub();

// The editable part of the config (links, categories, hidden containers, ...). `cfg` is updated in
// place when it changes, and everything below reads `cfg` at collection time, so edits apply live.
const store = new ConfigStore(cfg, cfg.demo ? { persist: false, seed: DEMO_FILE_CONFIG } : { persist: true });
await store.init();

const docker = new DockerClient(cfg.dockerHost);
const hostCollector = new HostCollector(cfg);
const tautulli = cfg.tautulli ? new TautulliSource(cfg.tautulli) : null;
const grafana = cfg.grafana;
const prober = new LinkProber(cfg.links);
const stats = new StatsCollector(docker);

/** The links topic has no source until at least one link is configured. */
function linksSource(): (() => Promise<LinkInfo[]>) | null {
  if (cfg.links.length === 0) return null;
  if (cfg.demo) return async () => demoLinks(cfg.links);
  return async () => {
    await prober.probeAll();
    return prober.snapshot();
  };
}

const topics = {
  host: new Topic<HostStats>('host', hub, 2_000, cfg.demo ? async () => demoHost() : () => hostCollector.collect()),
  containers: new Topic<ContainerInfo[]>(
    'containers',
    hub,
    10_000,
    cfg.demo
      ? async () => demoContainers({ hide: cfg.hide, overrides: cfg.overrides, groups: cfg.groups })
      : () => collectContainers(docker, { hostIp: cfg.hostIp, overrides: cfg.overrides, hide: cfg.hide, groups: cfg.groups }),
  ),
  stats: new Topic<Record<string, ContainerStats>>('stats', hub, 5_000, cfg.demo ? async () => demoStats() : () => stats.collect()),
  plex: new Topic<PlexData>('plex', hub, 5_000, cfg.demo ? async () => demoPlex() : tautulli ? () => tautulli.collect() : null),
  alerts: new Topic<AlertInfo[]>('alerts', hub, 30_000, cfg.demo ? async () => demoAlerts() : grafana ? () => fetchAlerts(grafana) : null),
  links: new Topic<LinkInfo[]>('links', hub, 30_000, linksSource()),
};

function buildMeta(): Meta {
  return {
    version: VERSION,
    title: cfg.title,
    demo: cfg.demo,
    hostIp: cfg.hostIp,
    groups: cfg.groups.map((g) => g.name),
    tautulliUrl: cfg.tautulli ? (cfg.tautulli.publicUrl ?? cfg.tautulli.url) : cfg.demo ? 'http://[IP]:8181' : null,
    grafanaUrl: cfg.grafana ? (cfg.grafana.publicUrl ?? cfg.grafana.url) : cfg.demo ? 'http://[IP]:3000' : null,
  };
}

for (const topic of Object.values(topics)) topic.start();
hub.publish('meta', buildMeta());
hub.publish('config', store.state());

// A config change, from the UI or from someone editing the file, reaches every open tab.
store.onChange(() => {
  prober.setLinks(cfg.links);
  topics.links.reconfigure(linksSource());
  void topics.containers.refresh();
  hub.publish('meta', buildMeta());
  hub.publish('config', store.state());
});

if (!cfg.demo) {
  docker.watchEvents(() => topics.containers.refreshSoon());
  // pick up hand edits to the file without a restart
  setInterval(() => void store.syncFromDisk().catch(() => undefined), 3_000).unref();
}

// ---------- routes ----------

app.get('/api/health', async () => ({ ok: true, version: VERSION }));
app.get('/api/meta', async () => buildMeta());
registerConfigRoutes(app, store);

app.get<{ Params: { topic: string } }>('/api/:topic', async (req, reply) => {
  const topic = topics[req.params.topic as keyof typeof topics];
  if (!topic) return reply.code(404).send({ error: 'unknown topic' });
  return topic.get();
});

app.get('/api/stream', (req, reply) => {
  reply.hijack();
  hub.add(reply.raw);
});

// ---------- static frontend ----------

if (fs.existsSync(cfg.webDir)) {
  await app.register(fastifyStatic, { root: cfg.webDir });
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
    return reply.sendFile('index.html');
  });
} else {
  app.log.warn(`web build not found at ${cfg.webDir}; run the Vite dev server or \`npm run build\``);
}

await app.listen({ port: cfg.port, host: '0.0.0.0' });

app.log.info(
  {
    demo: cfg.demo,
    docker: cfg.dockerHost,
    tautulli: Boolean(cfg.tautulli),
    grafana: Boolean(cfg.grafana),
    links: cfg.links.length,
    hostIp: cfg.hostIp ?? '(browser hostname)',
    config: store.state().writable ? cfg.configPath : `${cfg.configPath} (read-only)`,
  },
  `clearview ${VERSION} ready`,
);
