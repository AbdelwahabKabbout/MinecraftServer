import { beforeAll, afterAll, describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

process.env.DATABASE_URL = ":memory:";
process.env.NODE_ENV = "test";
const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "msm-modpack-test-"));
process.env.SERVER_ROOT = TEST_ROOT;

let serverRoot: string;

function sha256Of(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

const goodJar = Buffer.from("fake minecraft mod jar contents", "utf8");
const goodSha = sha256Of(goodJar);

function manifestFixture() {
  return {
    name: "Vanilla+ Lite",
    version: "1.0.0",
    minecraftVersion: "1.21.4",
    loader: "fabric",
    loaderVersion: "0.16.14",
    mods: [
      { id: "fabric-api", name: "Fabric API", version: "0.118.0+1.21.4", filename: "fabric-api-0.118.0+1.21.4.jar", sha256: goodSha, required: true },
      { id: "sodium", name: "Sodium", version: "0.6.0", filename: "sodium-0.6.0.jar", required: false },
    ],
  };
}

let modpackService: typeof import("../services/modpackService.js").modpackService;
let serverRepository: typeof import("../repositories/serverRepository.js").serverRepository;

beforeAll(async () => {
  const { runMigrations } = await import("../db/migrate.js");
  runMigrations();
  const { paths } = await import("../config/index.js");
  serverRoot = paths.serverRoot;
  modpackService = (await import("../services/modpackService.js")).modpackService;
  serverRepository = (await import("../repositories/serverRepository.js")).serverRepository;
});

afterAll(() => {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

async function createServer(directory: string): Promise<string> {
  const record = await serverRepository!.create({
    id: "srv-" + Math.random().toString(36).slice(2, 8),
    name: "Test Server",
    slug: "srv-" + Math.random().toString(36).slice(2, 8),
    loader: "fabric",
    javaPath: "java",
    serverDirectory: directory,
    memoryMinMb: 512,
    memoryMaxMb: 1024,
    port: 25565,
    status: "OFFLINE",
  });
  return record.id;
}

describe("ModpackService CRUD + import/export", () => {
  it("creates a modpack from a manifest object", async () => {
    const record = await modpackService!.createManifest(manifestFixture());
    expect(record.slug).toBe("vanilla-lite");
    expect(record.manifest.mods).toHaveLength(2);
    expect(record.manifest.loaderVersion).toBe("0.16.14");
  });

  it("makes duplicate slugs unique", async () => {
    const first = await modpackService!.createManifest(manifestFixture());
    const second = await modpackService!.createManifest(manifestFixture());
    expect(first.slug).toMatch(/^vanilla-lite(-\d+)?$/);
    expect(second.slug).toMatch(/^vanilla-lite-\d+$/);
    expect(first.slug).not.toBe(second.slug);
  });

  it("imports manifest JSON text", async () => {
    const record = await modpackService!.importManifest(JSON.stringify(manifestFixture()));
    expect(record.manifest.name).toBe("Vanilla+ Lite");
  });

  it("rejects malformed manifests on import", async () => {
    await expect(modpackService!.importManifest("nope")).rejects.toThrow(/not valid JSON/);
  });

  it("updates a modpack", async () => {
    const record = await modpackService!.createManifest(manifestFixture());
    const updated = await modpackService!.updateFromInput(record.id, {
      ...manifestFixture(),
      version: "1.1.0",
    });
    expect(updated.version).toBe("1.1.0");
  });

  it("lists, gets and deletes modpacks", async () => {
    const record = await modpackService!.createManifest(manifestFixture());
    const list = modpackService!.list();
    expect(list.some((m) => m.id === record.id)).toBe(true);
    expect(modpackService!.get(record.id).id).toBe(record.id);
    await modpackService!.remove(record.id);
    expect(modpackService!.list().some((m) => m.id === record.id)).toBe(false);
    expect(() => modpackService!.get(record.id)).toThrow();
  });
});

describe("ModpackService.validate", () => {
  it("reports ok mods and unexpected jars", async () => {
    const dirName = "mp-ok-" + Date.now();
    const modsDir = path.join(serverRoot, dirName, "mods");
    fs.mkdirSync(modsDir, { recursive: true });
    fs.writeFileSync(path.join(modsDir, "fabric-api-0.118.0+1.21.4.jar"), goodJar);
    const serverId = await createServer(dirName);

    const pack = await modpackService!.createManifest(manifestFixture());
    const report = await modpackService!.validate(pack.id, serverId);

    expect(report.summary).toEqual({ total: 2, ok: 1, missing: 1, versionMismatch: 0, checksumMismatch: 0, unexpected: 0 });
    expect(report.summary.unexpected).toBe(0);
    expect(report.issues.some((i) => i.level === "ok")).toBe(true);
    expect(report.issues.some((i) => i.level === "missing" && i.modId === "sodium")).toBe(true);
  });

  it("flags a missing mod, a version lookalike and checksum mismatch", async () => {
    const dirName = "mp-bad-" + Date.now();
    const modsDir = path.join(serverRoot, dirName, "mods");
    fs.mkdirSync(modsDir, { recursive: true });
    fs.writeFileSync(path.join(modsDir, "sodium-0.5.0.jar"), goodJar); // version lookalike
    fs.writeFileSync(path.join(modsDir, "fabric-api-0.118.0+1.21.4.jar"), Buffer.from("corrupted content")); // wrong sha
    fs.writeFileSync(path.join(modsDir, "random-capture.jar"), goodJar); // unexpected
    const serverId = await createServer(dirName);

    const pack = await modpackService!.createManifest(manifestFixture());
    const report = await modpackService!.validate(pack.id, serverId);

    expect(report.summary).toEqual({ total: 2, ok: 0, missing: 0, versionMismatch: 1, checksumMismatch: 1, unexpected: 1 });
    expect(report.issues.some((i) => i.level === "version-mismatch" && i.modId === "sodium")).toBe(true);
    expect(report.issues.some((i) => i.level === "checksum-mismatch" && i.modId === "fabric-api")).toBe(true);
    expect(report.issues.some((i) => i.level === "unexpected" && i.filename === "random-capture.jar")).toBe(true);
  });

  it("reports unexpected jars in an empty mods dir as unexpected only", async () => {
    const dirName = "mp-extra-" + Date.now();
    const modsDir = path.join(serverRoot, dirName, "mods");
    fs.mkdirSync(modsDir, { recursive: true });
    fs.writeFileSync(path.join(modsDir, "mystery.jar"), goodJar);
    const serverId = await createServer(dirName);

    const pack = await modpackService!.createManifest(manifestFixture());
    const report = await modpackService!.validate(pack.id, serverId);

    expect(report.summary).toEqual({ total: 2, ok: 0, missing: 2, versionMismatch: 0, checksumMismatch: 0, unexpected: 1 });
  });
});