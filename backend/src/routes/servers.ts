import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { serverService } from "../services/serverService.js";
import { success } from "../utils/api.js";
import { ApiError } from "../utils/api.js";

const createServerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64),
  minecraftVersion: z.string().trim().min(1).max(16).optional(),
  loader: z.enum(["fabric"]).optional(),
  loaderVersion: z.string().trim().min(1).max(32).optional(),
  javaPath: z.string().trim().min(1).max(512).optional(),
  serverDirectory: z.string().trim().min(1).max(512),
  memoryMinMb: z.number().int().positive().optional(),
  memoryMaxMb: z.number().int().positive().optional(),
  port: z.number().int().min(1).max(65535).optional(),
});

const updateServerSchema = createServerSchema.partial();

const commandSchema = z.object({
  command: z.string().min(1).max(1024),
});

export async function serverRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/servers", async () => {
    return success(await serverService.list());
  });

  app.post("/api/servers", async (request, reply) => {
    const parsed = createServerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid server configuration.", 400, parsed.error.flatten());
    }
    const server = await serverService.create(parsed.data);
    return reply.status(201).send(success(server));
  });

  app.get("/api/servers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    return success(await serverService.get(id));
  });

  app.put("/api/servers/:id", async (request) => {
    const { id } = request.params as { id: string };
    const parsed = updateServerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid server configuration.", 400, parsed.error.flatten());
    }
    return success(await serverService.update(id, parsed.data));
  });

  app.delete("/api/servers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await serverService.remove(id);
    return reply.status(200).send(success({ id, deleted: true }));
  });

  app.get("/api/servers/:id/status", async (request) => {
    const { id } = request.params as { id: string };
    const result = serverService.status(id);
    return success(result);
  });

  app.get("/api/servers/:id/detect", async (request) => {
    const { id } = request.params as { id: string };
    const { report } = serverService.detect(id);
    return success(report);
  });

  app.post("/api/servers/:id/start", async (request, reply) => {
    const { id } = request.params as { id: string };
    await serverService.start(id);
    return reply.status(200).send(success({ id, status: "STARTING" }));
  });

  app.post("/api/servers/:id/stop", async (request, reply) => {
    const { id } = request.params as { id: string };
    await serverService.stop(id);
    return reply.status(200).send(success({ id, status: "OFFLINE" }));
  });

  app.post("/api/servers/:id/restart", async (request, reply) => {
    const { id } = request.params as { id: string };
    await serverService.restart(id);
    return reply.status(200).send(success({ id, status: "STARTING" }));
  });

  app.post("/api/servers/:id/command", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = commandSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid command.", 400, parsed.error.flatten());
    }
    serverService.sendCommand(id, parsed.data.command);
    return reply.status(200).send(success({ id, sent: true }));
  });

  app.get("/api/servers/:id/console", async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string };
    const limit = query.limit ? Number(query.limit) : undefined;
    return success({ lines: serverService.consoleLines(id, limit) });
  });

  app.delete("/api/servers/:id/console", async (request) => {
    const { id } = request.params as { id: string };
    return success(serverService.clearConsole(id));
  });
}