import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { databaseVersion } from "../db/index.js";
import { success } from "../utils/api.js";
import { env } from "../config/index.js";
import { resolveAppVersion } from "../utils/version.js";

async function healthHandler(request: FastifyRequest, _reply: FastifyReply) {
  let hasDb: { sqlite: string } | null = null;
  try {
    hasDb = { sqlite: databaseVersion() };
  } catch (error) {
    request.log.error(error, "Database health check failed");
  }

  const healthy = hasDb !== null;
  const body = success({
    status: healthy ? "ok" : "degraded",
    version: resolveAppVersion(),
    uptimeSeconds: Math.round(process.uptime()),
    database: hasDb,
    environment: env.NODE_ENV,
  });

  return _reply.status(healthy ? 200 : 503).send(body);
}

/**
 * API root routes. All manager APIs live under /api; the bare / health
 * endpoint serves as a quick liveness check.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", healthHandler);
  app.get("/api", async (_request, _reply) =>
    _reply.type("application/json").send(success({
      name: "Minecraft Server Manager API",
      version: resolveAppVersion(),
      health: "/api/health",
    })));
  app.get("/", async (_request, _reply) =>
    _reply.type("application/json").send(success({
      name: "Minecraft Server Manager API",
      version: resolveAppVersion(),
      api: "/api",
    })));
}