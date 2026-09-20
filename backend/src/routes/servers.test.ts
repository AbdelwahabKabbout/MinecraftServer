import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";

process.env.DATABASE_URL = ":memory:";
process.env.NODE_ENV = "test";

let app: FastifyInstance;
let serverRoot: string;

const uid = (): string => "srv-" + Math.random().toString(36).slice(2, 8);

let fixtureCount = 0;
function body(overrides: Record<string, unknown> = {}) {
  fixtureCount += 1;
  return {
    name: "Server " + fixtureCount,
    serverDirectory: uid(),
    memoryMinMb: 512,
    memoryMaxMb: 1024,
    ...overrides,
  };
}

beforeAll(async () => {
  const { runMigrations } = await import("../db/migrate.js");
  runMigrations();
  const { buildApp } = await import("../server.ts");
  const { paths } = await import("../config/index.js");
  serverRoot = paths.serverRoot;
  app = await buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("/api/servers CRUD", () => {
  it("creates a server with a generated slug", async () => {
    const res = await app.inject({ method: "POST", url: "/api/servers", payload: body({ name: "Survival World" }) });

    expect(res.statusCode).toBe(201);
    const created = res.json().data;
    expect(created.slug).toBe("survival-world");
    expect(created.status).toBe("OFFLINE");
    expect(created.port).toBe(25565);
    expect(created.serverDirectory).toMatch(/^srv-/);
  });

  it("rejects invalid payloads with a validation envelope", async () => {
    const res = await app.inject({ method: "POST", url: "/api/servers", payload: { name: "" } });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("lists previously created servers", async () => {
    await app.inject({ method: "POST", url: "/api/servers", payload: body({ name: "Alpha" }) });
    await app.inject({ method: "POST", url: "/api/servers", payload: body({ name: "Beta" }) });
    const res = await app.inject({ method: "GET", url: "/api/servers" });
    expect(res.statusCode).toBe(200);
    const names = res.json().data.map((s: { name: string }) => s.name);
    expect(names).toContain("Alpha");
    expect(names).toContain("Beta");
  });

  it("makes slugs unique", async () => {
    await app.inject({ method: "POST", url: "/api/servers", payload: body({ name: "Dup" }) });
    const second = await app.inject({ method: "POST", url: "/api/servers", payload: body({ name: "Dup" }) });
    expect(second.statusCode).toBe(201);
    expect(second.json().data.slug).toBe("dup-2");
  });

  it("rejects two servers sharing a directory", async () => {
    const dir = uid();
    await app.inject({ method: "POST", url: "/api/servers", payload: body({ serverDirectory: dir }) });
    const res = await app.inject({ method: "POST", url: "/api/servers", payload: body({ name: "Other", serverDirectory: dir }) });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("SERVER_DIRECTORY_IN_USE");
  });

  it("gets a single server", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body() })).json().data;
    const res = await app.inject({ method: "GET", url: `/api/servers/${created.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(created.id);
  });

  it("returns 404 for unknown servers", async () => {
    const res = await app.inject({ method: "GET", url: "/api/servers/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("SERVER_NOT_FOUND");
  });

  it("updates a server", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body() })).json().data;
    const res = await app.inject({
      method: "PUT",
      url: `/api/servers/${created.id}`,
      payload: { port: 25570, memoryMaxMb: 4096 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.port).toBe(25570);
    expect(res.json().data.memoryMaxMb).toBe(4096);
  });

  it("rejects a directory change to an in-use directory", async () => {
    const a = (await app.inject({ method: "POST", url: "/api/servers", payload: body({ serverDirectory: "srv-a" }) })).json().data;
    await app.inject({ method: "POST", url: "/api/servers", payload: body({ name: "B", serverDirectory: "srv-b" }) });
    const res = await app.inject({ method: "PUT", url: `/api/servers/${a.id}`, payload: { serverDirectory: "srv-b" } });
    expect(res.statusCode).toBe(409);
  });

  it("deletes a server", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body() })).json().data;
    const res = await app.inject({ method: "DELETE", url: `/api/servers/${created.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted).toBe(true);
    const after = await app.inject({ method: "GET", url: `/api/servers/${created.id}` });
    expect(after.statusCode).toBe(404);
  });
});

describe("/api/servers detection and status", () => {
  it("reports status for a freshly created server", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body() })).json().data;
    const res = await app.inject({ method: "GET", url: `/api/servers/${created.id}/status` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("OFFLINE");
    expect(res.json().data.running).toBe(false);
  });

  it("detects an existing server directory", async () => {
    const dirName = "srv-real-" + Date.now();
    const dir = path.join(serverRoot, dirName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "fabric-server-mc.1.21.4-launcher.jar"), "x");
    fs.writeFileSync(path.join(dir, "eula.txt"), "eula=true");
    fs.mkdirSync(path.join(dir, "world"));

    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body({ name: "Real", serverDirectory: dirName }) })).json().data;
    const res = await app.inject({ method: "GET", url: `/api/servers/${created.id}/detect` });
    expect(res.statusCode).toBe(200);
    const report = res.json().data;
    expect(report.exists).toBe(true);
    expect(report.serverJar).toBe("fabric-server-mc.1.21.4-launcher.jar");
    expect(report.eulaAgreed).toBe(true);
    expect(report.hasWorldDir).toBe(true);
    expect(report.blockingMissing).toHaveLength(0);
  });

  it("reports blocking issues for an empty directory", async () => {
    const dirName = "srv-empty-" + Date.now();
    const dir = path.join(serverRoot, dirName);
    fs.mkdirSync(dir, { recursive: true });
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body({ name: "Empty", serverDirectory: dirName }) })).json().data;
    const res = await app.inject({ method: "GET", url: `/api/servers/${created.id}/detect` });
    const report = res.json().data;
    expect(report.exists).toBe(true);
    expect(report.blockingMissing).toEqual(expect.arrayContaining([expect.stringMatching(/server jar/)]));
  });

  it("start returns a clear error when the directory does not exist", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body({ serverDirectory: "ghost" }) })).json().data;
    const res = await app.inject({ method: "POST", url: `/api/servers/${created.id}/start` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("SERVER_DIRECTORY_MISSING");
  });
});
