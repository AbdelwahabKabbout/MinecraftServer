import Fastify, { type FastifyInstance } from "fastify";
import path from "node:path";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { env } from "./config/index.js";
import { logger } from "./config/logger.js";
import { healthRoutes } from "./routes/health.js";
import { serverRoutes } from "./routes/servers.js";
import { modpackRoutes } from "./routes/modpacks.js";
import { buildErrorHandler } from "./routes/errorHandler.js";
import { wsHub } from "./websocket/hub.js";

export async function buildApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? env.NODE_ENV !== "test",
    trustProxy: true,
  });

  await app.register(cors, {
    // Local-first application: allow the Vite dev server origin during development.
    origin: env.NODE_ENV === "development" ? true : false,
  });

  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });

  app.get("/ws", { websocket: true }, (connection) => {
    wsHub.add(connection);
    connection.on("close", () => wsHub.remove(connection));
    connection.on("error", () => wsHub.remove(connection));
  });

  app.setErrorHandler(buildErrorHandler());

  app.setNotFoundHandler(async (request, reply) => {
    request.log.warn({ method: request.method, url: request.url }, "Route not found");
    await reply.status(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: `Route ${request.method} ${request.url} not found` },
    });
  });

  await app.register(healthRoutes);
  await app.register(serverRoutes);
  await app.register(modpackRoutes);

  app.addHook("onClose", async () => {
    logger.info("Shutting down API server");
  });

  return app;
}