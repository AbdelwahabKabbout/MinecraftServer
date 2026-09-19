import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

// Point the singleton database at an in-memory SQLite before the backend
// modules are imported.
process.env.DATABASE_URL = ":memory:";
process.env.NODE_ENV = "test";

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../server.ts");
  app = await buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("API root and health", () => {
  it("returns API metadata at /api", async () => {
    const res = await app.inject({ method: "GET", url: "/api" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toMatch(/Minecraft Server Manager/);
    expect(typeof body.data.version).toBe("string");
  });

  it("reports healthy backend with database info at /api/health", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.database).not.toBeNull();
    expect(body.data.database.sqlite).toMatch(/^\d+\.\d+/);
  });

  it("returns a consistent, predictable error shape for unknown routes", async () => {
    const res = await app.inject({ method: "GET", url: "/api/does-not-exist" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(typeof body.error.message).toBe("string");
  });
});