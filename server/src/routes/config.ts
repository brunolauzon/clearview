import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ConfigStore, SaveResult } from '../configStore';

/**
 * Writes must come from our own page. Cross-site requests are blocked two ways: JSON content type
 * (a browser cannot send that cross-origin without a CORS preflight, which we never approve) and an
 * Origin check for anything that gets through.
 */
function sameOrigin(req: FastifyRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // curl and other non-browser clients send no Origin
  try {
    const host = new URL(origin).host;
    return host === req.headers.host || host === req.headers['x-forwarded-host'];
  } catch {
    return false;
  }
}

/** Returns true (after replying) when the request must not be processed. */
function rejected(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!req.headers['content-type']?.startsWith('application/json')) {
    void reply.code(415).send({ error: 'Send application/json.', issues: [] });
    return true;
  }
  if (!sameOrigin(req)) {
    void reply.code(403).send({ error: 'Cross-origin writes are not allowed.', issues: [] });
    return true;
  }
  return false;
}

function respond(reply: FastifyReply, result: SaveResult) {
  if (result.ok) return { ok: true, state: result.state };
  return reply.code(result.status).send({ error: result.error, issues: result.issues });
}

export function registerConfigRoutes(app: FastifyInstance, store: ConfigStore): void {
  app.get('/api/config', async () => store.state());

  app.put('/api/config', async (req, reply) => {
    if (rejected(req, reply)) return reply;
    const body = (req.body ?? {}) as { config?: unknown; version?: unknown };
    return respond(reply, await store.save(body.config, body.version));
  });

  app.put('/api/config/raw', async (req, reply) => {
    if (rejected(req, reply)) return reply;
    const body = (req.body ?? {}) as { yaml?: unknown; version?: unknown };
    return respond(reply, await store.saveRaw(body.yaml, body.version));
  });
}
