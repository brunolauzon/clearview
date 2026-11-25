import fs from 'node:fs';
import Fastify, { LogController } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { AlertInfo, ContainerInfo, HostStats, LinkInfo, Meta, PlexData } from '@clearview/shared';
import { loadConfig, VERSION } from './config';
import { Hub, Topic } from './hub';
import { collectContainers, DockerClient } from './sources/docker';
import { HostCollector } from './sources/host';
import { fetchAlerts } from './sources/grafana';
import { TautulliSource } from './sources/tautulli';
import { LinkProber } from './sources/links';
import { demoAlerts, demoContainers, demoHost, demoLinks, demoPlex } from './sources/demo';
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

const docker = new DockerClient(cfg.dockerHost);
const hostCollector = new HostCollector(cfg);
const tautulli = cfg.tautulli ? new TautulliSource(cfg.tautulli) : null;
const grafana = cfg.grafana;
const prober = new LinkProber(cfg.links);

const topics = {
  host: new Topic<HostStats>('host', hub, 2_000, cfg.demo ? async () => demoHost() : () => hostCollector.collect()),
  containers: new Topic<ContainerInfo[]>(
    'containers',
    hub,
    10_000,
    cfg.demo
      ? async () => demoContainers()
      : () => collectContainers(docker, { hostIp: cfg.hostIp, overrides: cfg.overrides, hide: cfg.hide }),
  ),
  plex: new Topic<PlexData>('plex', hub, 5_000, cfg.demo ? async () => demoPlex() : tautulli ? () => tautulli.collect() : null),
  alerts: new Topic<AlertInfo[]>('alerts', hub, 30_000, cfg.demo ? async () => demoAlerts() : grafana ? () => fetchAlerts(grafana) : null),
  links: new Topic<LinkInfo[]>(
    'links',
    hub,
    30_000,
    cfg.demo
      ? async () => demoLinks()
      : cfg.links.length > 0
        ? async () => {
            await prober.probeAll();
            return prober.snapshot();
          }
        : null,
  ),
};

const meta: Meta = {
  version: VERSION,
  title: cfg.title,
  demo: cfg.demo,
  hostIp: cfg.hostIp,
  tautulliUrl: cfg.tautulli ? (cfg.tautulli.publicUrl ?? cfg.tautulli.url) : cfg.demo ? 'http://[IP]:8181' : null,
  grafanaUrl: cfg.grafana ? (cfg.grafana.publicUrl ?? cfg.grafana.url) : cfg.demo ? 'http://[IP]:3000' : null,
};

for (const topic of Object.values(topics)) topic.start();
hub.publish('meta', meta);

if (!cfg.demo) {
  docker.watchEvents(() => topics.containers.refreshSoon());
}

// ---------- routes ----------

app.get('/api/health', async () => ({ ok: true, version: VERSION }));
app.get('/api/meta', async () => meta);

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
  },
  `clearview ${VERSION} ready`,
);
