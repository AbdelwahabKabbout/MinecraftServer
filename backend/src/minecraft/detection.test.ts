import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectServerDirectory } from "./detection.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-detect-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("detectServerDirectory", () => {
  it("reports missing directory", () => {
    const report = detectServerDirectory(path.join(os.tmpdir(), "does-not-exist-xyz"));
    expect(report.exists).toBe(false);
    expect(report.blockingMissing).toContain("directory does not exist");
  });

  it("finds a fabric launcher jar and prefers it", () => {
    fs.writeFileSync(path.join(dir, "server.jar"), "x");
    fs.writeFileSync(path.join(dir, "fabric-server-mc.1.21.4-launcher.jar"), "x");
    const report = detectServerDirectory(dir);
    expect(report.exists).toBe(true);
    expect(report.serverJar).toBe("fabric-server-mc.1.21.4-launcher.jar");
    expect(report.blockingMissing).not.toContainEqual(expect.stringContaining("server jar"));
  });

  it("falls back to server.jar", () => {
    fs.writeFileSync(path.join(dir, "server.jar"), "x");
    const report = detectServerDirectory(dir);
    expect(report.serverJar).toBe("server.jar");
  });

  it("reports missing server jar as blocking", () => {
    fs.writeFileSync(path.join(dir, "readme.txt"), "hi");
    const report = detectServerDirectory(dir);
    expect(report.serverJar).toBeNull();
    expect(report.blockingMissing.some((m) => m.includes("server jar"))).toBe(true);
  });

  it("detects eula agreement", () => {
    fs.writeFileSync(path.join(dir, "eula.txt"), "eula=true\n");
    const report = detectServerDirectory(dir);
    expect(report.eulaPresent).toBe(true);
    expect(report.eulaAgreed).toBe(true);
    expect(report.blockingMissing.some((m) => m.includes("eula"))).toBe(false);
  });

  it("flags an unsigned eula as blocking", () => {
    fs.writeFileSync(path.join(dir, "eula.txt"), "eula=false\n");
    const report = detectServerDirectory(dir);
    expect(report.eulaPresent).toBe(true);
    expect(report.eulaAgreed).toBe(false);
    expect(report.blockingMissing.some((m) => m.includes("eula"))).toBe(true);
  });

  it("flags a missing eula as blocking", () => {
    const report = detectServerDirectory(dir);
    expect(report.eulaPresent).toBe(false);
    expect(report.blockingMissing.some((m) => m.includes("eula"))).toBe(true);
  });

  it("detects structural directories", () => {
    for (const sub of ["mods", "config", "world", "logs", "crash-reports"]) {
      fs.mkdirSync(path.join(dir, sub));
    }
    const report = detectServerDirectory(dir);
    expect(report.hasModsDir).toBe(true);
    expect(report.hasConfigDir).toBe(true);
    expect(report.hasWorldDir).toBe(true);
    expect(report.hasLogsDir).toBe(true);
    expect(report.hasCrashReportsDir).toBe(true);
  });

  it("detects server.properties presence", () => {
    fs.writeFileSync(path.join(dir, "server.properties"), "server-port=25565\n");
    const report = detectServerDirectory(dir);
    expect(report.hasServerProperties).toBe(true);
    expect(report.serverPropertiesPath).toBe(path.join(dir, "server.properties"));
  });
});