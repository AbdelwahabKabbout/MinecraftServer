import type { FastifyInstance } from "fastify";
import { modpackService } from "../services/modpackService.js";
import { ApiError, success } from "../utils/api.js";

export async function modpackRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/modpacks", async () => {
    return success(modpackService.list());
  });

  app.post("/api/modpacks", async (request, reply) => {
    const record = await modpackService.createManifest(request.body);
    return reply.status(201).send(success(record));
  });

  app.post("/api/modpacks/import", async (request, reply) => {
    const body = request.body as { text?: string } | undefined;
    const text = body?.text;
    if (typeof text !== "string" || text.trim() === "") {
      throw new ApiError("VALIDATION_ERROR", "Import payload must include a manifest JSON `text`.", 400);
    }
    const record = await modpackService.importManifest(text);
    return reply.status(201).send(success(record));
  });

  app.get("/api/modpacks/:id", async (request) => {
    const { id } = request.params as { id: string };
    return success(modpackService.get(id));
  });

  app.put("/api/modpacks/:id", async (request) => {
    const { id } = request.params as { id: string };
    return success(await modpackService.updateFromInput(id, request.body));
  });

  app.delete("/api/modpacks/:id", async (request) => {
    const { id } = request.params as { id: string };
    return success(await modpackService.remove(id));
  });

  app.get("/api/modpacks/:id/manifest", async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.type("application/json").send(modpackService.get(id).manifest);
  });

  app.get("/api/modpacks/:id/validate", async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { serverId?: string };
    if (!query.serverId) {
      throw new ApiError("VALIDATION_ERROR", "Validation requires a ?serverId= query parameter.", 400);
    }
    return success(await modpackService.validate(id, query.serverId));
  });
}