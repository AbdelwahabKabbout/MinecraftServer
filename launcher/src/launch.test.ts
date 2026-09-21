import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchServer, resolveServerJar, type LaunchOptions } from "./launch.js";

function fakeChild() {
  return Object.assign(new EventEmitter(), { pid: 4242, killed: false, kill: () => true });
}

describe("resolveServerJar", () => {
  it("prefers the fabric launcher jar over server.jar", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jr-"));
    fs.writeFileSync(path.join(dir, "server.jar"), "");
    fs.writeFileSync(path.join(dir, "fabric-server-mc.1.21.4-loader.0.16.14-launcher.jar"), "");
    expect(resolveServerJar(dir)).toBe("fabric-server-mc.1.21.4-loader.0.16.14-launcher.jar");
  });

  it("falls back to server.jar", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jr-"));
    fs.writeFileSync(path.join(dir, "server.jar"), "");
    expect(resolveServerJar(dir)).toBe("server.jar");
  });

  it("returns null when no server jar exists", () => {
    expect(resolveServerJar(fs.mkdtempSync(path.join(os.tmpdir(), "jr-")))).toBeNull();
  });
});

describe("launchServer", () => {
  it("spawns java with Xms/Xmx and the resolved jar", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ln-"));
    fs.writeFileSync(path.join(dir, "server.jar"), "");
    const spawn = vi.fn(() => fakeChild());
    const options: LaunchOptions = { java: "/usr/bin/java", serverJar: path.join(dir, "server.jar"), workingDir: dir, memoryMinMb: 512, memoryMaxMb: 2048 };
    const result = launchServer(options, spawn as never);
    expect(result.started).toBe(true);
    expect(spawn).toHaveBeenCalledWith("/usr/bin/java", ["-Xms512M", "-Xmx2048M", "-jar", path.join(dir, "server.jar"), "nogui"], {
      cwd: dir,
      stdio: "inherit",
      shell: false,
    });
  });

  it("refuses to launch when the jar is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ln-"));
    const options: LaunchOptions = { java: "java", serverJar: path.join(dir, "nope.jar"), workingDir: dir, memoryMinMb: 512, memoryMaxMb: 1024 };
    const result = launchServer(options);
    expect(result.started).toBe(false);
    if (!result.started) expect(result.error).toMatch(/not found/);
  });
});