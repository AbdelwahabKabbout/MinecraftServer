import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

process.env.DATABASE_URL = ":memory:";
process.env.NODE_ENV = "test";

let app: FastifyInstance;

const uid = (): string => "c-" + Math.random().toString(36).slice(2, 8);

beforeAll(async () => {
  const { runMigrations } = await import("../db/migrate.js");
  runMigrations();
  const { buildApp } = await import("../server.js");
  app = await buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("consoleRepository", () => {
  it("inserts and reads lines oldest-first", async () => {
    const { consoleRepository } = await import("../repositories/consoleRepository.js");
    const id = uid();
    consoleRepository.insert(id, [
      { line: "one", timestamp: 100 },
      { line: "two", timestamp: 200 },
      { line: "three", timestamp: 300 },
    ]);
    const lines = consoleRepository.read(id);
    expect(lines.map((l) => l.line)).toEqual(["one", "two", "three"]);
    expect(lines[2].timestamp).toBe(300);
  });

  it("keeps the newest rows when pruned", async () => {
    const { consoleRepository, MAX_KEPT_ROWS_PER_SERVER } = await import("../repositories/consoleRepository.js");
    const id = uid();
    for (let i = 0; i < 3005; i += 1) {
      consoleRepository.insert(id, [{ line: `line ${i}`, timestamp: i }]);
    }
    consoleRepository.prune(id);
    expect(consoleRepository.count(id)).toBe(MAX_KEPT_ROWS_PER_SERVER);
    const tail = consoleRepository.read(id, { limit: MAX_KEPT_ROWS_PER_SERVER });
    expect(tail[0].line).toBe(`line ${3005 - MAX_KEPT_ROWS_PER_SERVER}`);
  });

  it("isolates histories per server", async () => {
    const { consoleRepository } = await import("../repositories/consoleRepository.js");
    const a = uid();
    const b = uid();
    consoleRepository.insert(a, [{ line: "only-a", timestamp: 1 }]);
    consoleRepository.insert(b, [{ line: "only-b", timestamp: 1 }]);
    expect(consoleRepository.read(a).map((l) => l.line)).toEqual(["only-a"]);
    expect(consoleRepository.read(b).map((l) => l.line)).toEqual(["only-b"]);
  });

  it("clears a server's history without touching others", async () => {
    const { consoleRepository } = await import("../repositories/consoleRepository.js");
    const a = uid();
    const b = uid();
    consoleRepository.insert(a, [{ line: "aaa", timestamp: 1 }]);
    consoleRepository.insert(b, [{ line: "bbb", timestamp: 1 }]);
    consoleRepository.clear(a);
    expect(consoleRepository.count(a)).toBe(0);
    expect(consoleRepository.read(b).map((l) => l.line)).toEqual(["bbb"]);
  });
});

describe("ConsoleService batching", () => {
  function repo() {
    return import("../repositories/consoleRepository.js");
  }
  function service() {
    return import("../services/consoleService.js");
  }

  it("flushes queued lines into the repository", async () => {
    const { consoleRepository } = await repo();
    const { ConsoleService } = await service();
    const svc = new ConsoleService(10);
    try {
      const id = uid();
      svc.handleLine(id, "hello", 5);
      svc.handleLine(id, "world", 6);
      expect(consoleRepository.count(id)).toBe(0);
      svc.flushNow();
      expect(consoleRepository.count(id)).toBe(2);
    } finally {
      svc.dispose();
    }
  });

  it("prunes down to the cap on flush", async () => {
    const { consoleRepository, MAX_KEPT_ROWS_PER_SERVER } = await repo();
    const { ConsoleService } = await service();
    const svc = new ConsoleService(10);
    try {
      const id = uid();
      for (let i = 0; i < MAX_KEPT_ROWS_PER_SERVER + 50; i += 1) {
        svc.handleLine(id, `line ${i}`, i);
      }
      svc.flushNow();
      expect(consoleRepository.count(id)).toBe(MAX_KEPT_ROWS_PER_SERVER);
    } finally {
      svc.dispose();
    }
  });

  it("clear also drops pending queued lines", async () => {
    const { consoleRepository } = await repo();
    const { ConsoleService } = await service();
    const svc = new ConsoleService(10);
    try {
      const id = uid();
      svc.handleLine(id, "pending", 1);
      svc.clear(id);
      svc.flushNow();
      expect(consoleRepository.count(id)).toBe(0);
    } finally {
      svc.dispose();
    }
  });
});