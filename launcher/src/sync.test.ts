import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncMods, validateMods, listJars, findVersionLookalike, type SyncCallbacks } from "./sync.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "launcher-sync-"));
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const GOOD_CONTENT = "a".repeat(64);
const GOOD_HASH = sha256(GOOD_CONTENT);

const manifest = {
  name: "Test",
  version: "1.0.0",
  minecraftVersion: "1.21.4",
  loader: "fabric" as const,
  mods: [
    { id: "fabric-api", name: "Fabric API", version: "1.0.0", filename: "fabric-api.jar", downloadUrl: "https://cdn.example/fabric-api.jar", sha256: GOOD_HASH, required: true },
    { id: "sodium", name: "Sodium", version: "1.0.0", filename: "sodium.jar", required: true },
  ],
};

describe("listJars and findVersionLookalike", () => {
  it("lists jars only, sorted", async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "b.jar"), "");
    fs.writeFileSync(path.join(dir, "a.jar"), "");
    fs.writeFileSync(path.join(dir, "readme.txt"), "");
    expect(await listJars(dir)).toEqual(["a.jar", "b.jar"]);
  });

  it("heuristics match jars prefixed by the mod id", () => {
    const jars = ["fabric-api-0.118.0.jar", "sodium-0.6.0.jar"];
    expect(findVersionLookalike(jars, "fabric-api")).toBe("fabric-api-0.118.0.jar");
    expect(findVersionLookalike(jars, "sodium")).toBe("sodium-0.6.0.jar");
    expect(findVersionLookalike(jars, "nope")).toBeUndefined();
  });
});

describe("syncMods", () => {
  it("downloads missing mods and verifies checksums", async () => {
    const dir = tmpDir();
    const downloads: string[] = [];
    const downloading: SyncCallbacks = {
      download: async (url, destination) => {
        downloads.push(url);
        fs.writeFileSync(destination, GOOD_CONTENT);
        return { ok: true };
      },
    };
    const result = await syncMods(manifest, dir, downloading);
    expect(result.summary.downloaded).toBe(1);
    expect(downloads).toEqual(["https://cdn.example/fabric-api.jar"]);
    expect(fs.existsSync(path.join(dir, "fabric-api.jar"))).toBe(true);
  });

  it("keeps an existing correct file and downloads only the missing one", async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "fabric-api.jar"), GOOD_CONTENT);
    const downloading: SyncCallbacks = { download: async () => ({ ok: false, error: "should not be called" }) };
    const result = await syncMods(manifest, dir, downloading);
    expect(result.summary.downloaded).toBe(0);
    expect(result.actions.map((a) => a.action)).not.toContain("error");
    expect(result.actions[0]?.action).toBe("ok");
  });

  it("redownloads when the checksum does not match", async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "fabric-api.jar"), "b".repeat(64));
    const downloading: SyncCallbacks = {
      download: async (_url, destination) => {
        fs.writeFileSync(destination, GOOD_CONTENT);
        return { ok: true };
      },
    };
    const result = await syncMods(manifest, dir, downloading);
    expect(result.summary.redownloaded).toBe(1);
    expect(fs.readFileSync(path.join(dir, "fabric-api.jar"), "utf8")).toBe(GOOD_CONTENT);
  });

  it("flags files lacking a downloadUrl as no-url", async () => {
    const dir = tmpDir();
    const result = await syncMods(manifest, dir, {});
    expect(result.actions.some((a) => a.filename === "sodium.jar" && a.action === "no-url")).toBe(true);
  });

  it("reports unwanted jars but leaves them untouched", async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "stray.jar"), "stray");
    const result = await syncMods(manifest, dir, { download: async () => ({ ok: false, error: "x" }) });
    expect(result.summary.unwanted).toBe(1);
    expect(fs.readFileSync(path.join(dir, "stray.jar"), "utf8")).toBe("stray");
  });

  it("does not treat a reported version lookalike as unwanted", async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "sodium-0.5.9.jar"), "prev");
    const result = await syncMods({ ...manifest, mods: [{ ...manifest.mods[1]!, filename: "sodium.jar", version: "1.0.0" }] }, dir, {
      download: async () => ({ ok: false, error: "x" }),
    });
    expect(result.summary.unwanted).toBe(0);
    expect(result.actions.some((a) => a.message.includes("sodium-0.5.9.jar"))).toBe(true);
  });
});

describe("validateMods", () => {
  it("produces a read-only report mixing all levels without writing", async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "fabric-api.jar"), GOOD_CONTENT);
    fs.writeFileSync(path.join(dir, "sodium-old.jar"), "older sodium");
    const report = await validateMods(
      {
        ...manifest,
        mods: [
          manifest.mods[0]!,
          { ...manifest.mods[0]!, id: "sodium", filename: "sodium.jar", downloadUrl: undefined, sha256: GOOD_HASH },
          { ...manifest.mods[1]!, id: "stray", filename: "extra.jar" },
        ],
      },
      dir,
    );
    expect(report.summary.ok).toBe(1);
    expect(report.summary.versionMismatch).toBe(1);
    expect(report.summary.unexpected).toBe(0);
    expect(fs.existsSync(path.join(dir, "sodium.jar"))).toBe(false);
  });
});