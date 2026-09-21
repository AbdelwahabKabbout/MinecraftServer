import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

process.env.DATABASE_URL = ":memory:";
process.env.NODE_ENV = "test";

let app: FastifyInstance;
let repo: typeof import("../repositories/serverRepository.js").serverRepository;

const uid = (): string => "net-" + Math.random().toString(36).slice(2, 8);

beforeAll(async () => {
  const { runMigrations } = await import("../db/migrate.js");
  runMigrations();
  const { buildApp } = await import("../server.ts");
  repo = (await import("../repositories/serverRepository.js")).serverRepository;
  app = await buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function createServer(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/servers",
    payload: { name: "Network Test", serverDirectory: uid(), memoryMinMb: 512, memoryMaxMb: 1024 },
  });
  return res.json().data.id;
}

describe("/api/servers/:id/network", () => {
  it("returns local addresses with the server port", async () => {
    const id = await createServer();
    const res = await app.inject({ method: "GET", url: `/api/servers/${id}/network` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.serverId).toBe(id);
    expect(data.serverPort).toBe(25565);
    expect(data.provider).toBe("local");
    expect(data.usable).toBe(true);
    expect(data.addresses.length).toBeGreaterThan(0);
    expect(data.addresses[0]).toMatchObject({ port: 25565 });
    expect(data.addresses.every((a: { host: string }) => a.host.length > 0)).toBe(true);
  });

  it("honors a custom server port", async () => {
    const id = await createServer();
    await app.inject({ method: "PUT", url: `/api/servers/${id}`, payload: { port: 30001 } });
    const res = await app.inject({ method: "GET", url: `/api/servers/${id}/network` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.serverPort).toBe(30001);
    expect(res.json().data.addresses[0].port).toBe(30001);
  });

  it("returns 404 for an unknown server", async () => {
    const res = await app.inject({ method: "GET", url: "/api/servers/does-not-exist/network" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("SERVER_NOT_FOUND");
  });

  it("returns 422 when the provider is not registered", async () => {
    const id = await createServer();
    await repo.update(id, { networkProvider: "tunnel" as never });
    const res = await app.inject({ method: "GET", url: `/api/servers/${id}/network` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("NETWORK_PROVIDER_NOT_FOUND");
  });
});

describe("/api/networking/providers", () => {
  it("lists the default local provider", async () => {
    const res = await app.inject({ method: "GET", url: "/api/networking/providers" });
    expect(res.statusCode).toBe(200);
    const providers = res.json().data;
    expect(providers).toContainEqual({ kind: "local", label: "Local network" });
  });
});