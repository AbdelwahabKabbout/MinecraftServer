import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.DATABASE_URL = ":memory:";
process.env.NODE_ENV = "test";
const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "msm-modpack-routes-"));
process.env.SERVER_ROOT = TEST_ROOT;

let app: FastifyInstance;

const manifest = {
  name: "Route Pack",
  version: "2.0.0",
  minecraftVersion: "1.21.4",
  loader: "fabric",
  loaderVersion: "0.16.14",
  mods: [
    { id: "x", name: "X", version: "1", filename: "x.jar" },
    { id: "y", name: "Y", version: "2", filename: "y.jar" },
  ],
};

beforeAll(async () => {
  const { runMigrations } = await import("../db/migrate.js");
  runMigrations();
  const { buildApp } = await import("../server.js");
  app = await buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("/api/modpacks", () => {
  it("creates a modpack", async () => {
    const res = await app.inject({ method: "POST", url: "/api/modpacks", payload: manifest });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.slug).toBe("route-pack");
    expect(res.json().data.manifest.mods).toHaveLength(2);
  });

  it("rejects an invalid manifest", async () => {
    const res = await app.inject({ method: "POST", url: "/api/modpacks", payload: { name: "X", version: "1", minecraftVersion: "bad", mods: [] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("imports from text", async () => {
    const res = await app.inject({ method: "POST", url: "/api/modpacks/import", payload: { text: JSON.stringify({ ...manifest, name: "Imported Pack" }) } });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.name).toBe("Imported Pack");
  });

  it("import requires text", async () => {
    const res = await app.inject({ method: "POST", url: "/api/modpacks/import", payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("lists, exports manifest, updates and deletes", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/modpacks", payload: manifest })).json().data;

    const list = await app.inject({ method: "GET", url: "/api/modpacks" });
    expect(list.json().data.some((m: { id: string }) => m.id === created.id)).toBe(true);

    const exportRes = await app.inject({ method: "GET", url: `/api/modpacks/${created.id}/manifest` });
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.json().name).toBe("Route Pack");
    expect(exportRes.headers["content-type"]).toContain("application/json");

    const updateRes = await app.inject({ method: "PUT", url: `/api/modpacks/${created.id}`, payload: { ...manifest, version: "2.1.0" } });
    expect(updateRes.json().data.version).toBe("2.1.0");

    const del = await app.inject({ method: "DELETE", url: `/api/modpacks/${created.id}` });
    expect(del.json().data.deleted).toBe(true);

    const gone = await app.inject({ method: "GET", url: `/api/modpacks/${created.id}/manifest` });
    expect(gone.statusCode).toBe(404);
  });

  it("validates against a server and requires serverId", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/modpacks", payload: manifest })).json().data;
    const server = (await app.inject({ method: "POST", url: "/api/servers", payload: { name: "V S", serverDirectory: "modpack-target", memoryMinMb: 512, memoryMaxMb: 1024 } })).json().data;

    const missing = await app.inject({ method: "GET", url: `/api/modpacks/${created.id}/validate` });
    expect(missing.statusCode).toBe(400);

    const report = await app.inject({ method: "GET", url: `/api/modpacks/${created.id}/validate?serverId=${server.id}` });
    expect(report.statusCode).toBe(200);
    expect(report.json().data.summary).toEqual({ total: 2, ok: 0, missing: 2, versionMismatch: 0, checksumMismatch: 0, unexpected: 0 });
  });
});