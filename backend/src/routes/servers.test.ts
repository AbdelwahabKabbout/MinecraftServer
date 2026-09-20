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

function makeRealDir(dirName: string): string {
  const dir = path.join(serverRoot, dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
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

describe("/api/servers console", () => {
  it("returns persisted console lines ordered oldest-first", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body() })).json().data;
    const { consoleRepository } = await import("../repositories/consoleRepository.js");
    consoleRepository.insert(created.id, [
      { line: "first line", timestamp: 1000 },
      { line: "second line", timestamp: 2000 },
    ]);

    const res = await app.inject({ method: "GET", url: `/api/servers/${created.id}/console` });
    expect(res.statusCode).toBe(200);
    const lines = res.json().data.lines;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ line: "first line", timestamp: 1000 });
    expect(lines[1]).toEqual({ line: "second line", timestamp: 2000 });
  });

  it("respects the limit and default of the console read", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body() })).json().data;
    const { consoleRepository } = await import("../repositories/consoleRepository.js");
    for (let i = 0; i < 5; i += 1) {
      consoleRepository.insert(created.id, [{ line: `line ${i}`, timestamp: i * 10 }]);
    }

    const res = await app.inject({ method: "GET", url: `/api/servers/${created.id}/console?limit=2` });
    expect(res.json().data.lines.map((l: { line: string }) => l.line)).toEqual(["line 3", "line 4"]);
  });

  it("clears the console and returns the number of removed lines", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body() })).json().data;
    const { consoleRepository } = await import("../repositories/consoleRepository.js");
    consoleRepository.insert(created.id, [
      { line: "a", timestamp: 1 },
      { line: "b", timestamp: 2 },
    ]);

    const res = await app.inject({ method: "DELETE", url: `/api/servers/${created.id}/console` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ id: created.id, cleared: true, removed: 2 });

    const after = await app.inject({ method: "GET", url: `/api/servers/${created.id}/console` });
    expect(after.json().data.lines).toHaveLength(0);
  });

  it("404s for unknown servers", async () => {
    const res = await app.inject({ method: "GET", url: "/api/servers/nope/console" });
    expect(res.statusCode).toBe(404);
  });

  it("removes console history when the server is deleted", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body() })).json().data;
    const { consoleRepository } = await import("../repositories/consoleRepository.js");
    consoleRepository.insert(created.id, [{ line: "gone soon", timestamp: 1 }]);

    await app.inject({ method: "DELETE", url: `/api/servers/${created.id}` });
    expect(consoleRepository.count(created.id)).toBe(0);
  });
});

describe("/api/servers properties", () => {
  it("reports exists=false when no properties file exists", async () => {
    const dirName = "prop-empty-" + Date.now();
    makeRealDir(dirName);
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body({ serverDirectory: dirName }) })).json().data;

    const res = await app.inject({ method: "GET", url: `/api/servers/${created.id}/properties` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.exists).toBe(false);
    expect(res.json().data.text).toBeNull();
    expect(res.json().data.path).toBe(`${dirName}/server.properties`);
  });

  it("creates a properties file from a structured patch and returns it", async () => {
    const dirName = "prop-create-" + Date.now();
    makeRealDir(dirName);
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body({ serverDirectory: dirName }) })).json().data;

    const res = await app.inject({
      method: "PUT",
      url: `/api/servers/${created.id}/properties`,
      payload: { values: { "server-port": "25570", motd: "Hello" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.exists).toBe(true);
    expect(res.json().data.pairs).toContainEqual({ key: "server-port", value: "25570" });

    const file = path.join(serverRoot, dirName, "server.properties");
    expect(fs.existsSync(file)).toBe(true);
    const text = fs.readFileSync(file, "utf8");
    expect(text).toContain("motd=Hello");
  });

  it("patches a single key and preserves comments and unknown keys", async () => {
    const dirName = "prop-patch-" + Date.now();
    const dir = makeRealDir(dirName);
    fs.writeFileSync(
      path.join(dir, "server.properties"),
      "#Minecraft server properties\nmotd=A lovely server\nsome-future-key=whatever\n",
    );
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body({ serverDirectory: dirName }) })).json().data;

    const res = await app.inject({
      method: "PUT",
      url: `/api/servers/${created.id}/properties`,
      payload: { values: { motd: "New MOTD" } },
    });
    expect(res.statusCode).toBe(200);
    const text = res.json().data.text;
    expect(text).toContain("#Minecraft server properties");
    expect(text).toContain("some-future-key=whatever");
    expect(text.match(/motd=New MOTD/g)).toHaveLength(1);

    const read = await app.inject({ method: "GET", url: `/api/servers/${created.id}/properties` });
    expect(read.json().data.pairs).toContainEqual({ key: "motd", value: "New MOTD" });
  });

  it("removes a key when its value is null", async () => {
    const dirName = "prop-remove-" + Date.now();
    const dir = makeRealDir(dirName);
    fs.writeFileSync(path.join(dir, "server.properties"), "#Minecraft server properties\nwhite-list=false\n");
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body({ serverDirectory: dirName }) })).json().data;

    const res = await app.inject({
      method: "PUT",
      url: `/api/servers/${created.id}/properties`,
      payload: { values: { "white-list": null } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.text).not.toContain("white-list");
    expect(res.json().data.text).toContain("#Minecraft server properties");
  });

  it("writes raw properties text verbatim", async () => {
    const dirName = "prop-raw-" + Date.now();
    makeRealDir(dirName);
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body({ serverDirectory: dirName }) })).json().data;

    const res = await app.inject({
      method: "PUT",
      url: `/api/servers/${created.id}/properties`,
      payload: { raw: "#Minecraft server properties\nmax-players=25\n" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.text).toBe("#Minecraft server properties\nmax-players=25\n");
    expect(res.json().data.pairs).toContainEqual({ key: "max-players", value: "25" });
  });

  it("rejects a structured patch with an invalid key or newline value", async () => {
    const dirName = "prop-bad-" + Date.now();
    makeRealDir(dirName);
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body({ serverDirectory: dirName }) })).json().data;

    const badKey = await app.inject({
      method: "PUT",
      url: `/api/servers/${created.id}/properties`,
      payload: { values: { "My MOTD": "x" } },
    });
    expect(badKey.statusCode).toBe(400);
    expect(badKey.json().error.code).toBe("VALIDATION_ERROR");

    const badValue = await app.inject({
      method: "PUT",
      url: `/api/servers/${created.id}/properties`,
      payload: { values: { motd: "line one\nline two" } },
    });
    expect(badValue.statusCode).toBe(400);
  });

  it("rejects malformed raw content with a line-level report", async () => {
    const dirName = "prop-badraw-" + Date.now();
    makeRealDir(dirName);
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body({ serverDirectory: dirName }) })).json().data;

    const res = await app.inject({
      method: "PUT",
      url: `/api/servers/${created.id}/properties`,
      payload: { raw: "server-port=25565\nBad Line Here\n" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("PROPERTIES_INVALID");
    expect(res.json().error.details).toHaveLength(1);
  });

  it("requires exactly one of values or raw", async () => {
    const dirName = "prop-neither-" + Date.now();
    makeRealDir(dirName);
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body({ serverDirectory: dirName }) })).json().data;

    const both = await app.inject({
      method: "PUT",
      url: `/api/servers/${created.id}/properties`,
      payload: { values: { motd: "x" }, raw: "motd=y\n" },
    });
    expect(both.statusCode).toBe(400);

    const none = await app.inject({
      method: "PUT",
      url: `/api/servers/${created.id}/properties`,
      payload: {},
    });
    expect(none.statusCode).toBe(400);
  });

  it("rejects updates when the server directory does not exist", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/servers", payload: body({ serverDirectory: "ghost-dir" }) })).json().data;

    const res = await app.inject({
      method: "PUT",
      url: `/api/servers/${created.id}/properties`,
      payload: { raw: "motd=x\n" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("SERVER_DIRECTORY_MISSING");
  });
});
