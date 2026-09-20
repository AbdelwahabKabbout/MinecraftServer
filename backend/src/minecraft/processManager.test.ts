import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { ProcessManager, type SpawnFn } from "./processManager.js";
import type { ServerRow } from "../db/schema.js";
import { ApiError } from "../utils/api.js";

type FakeChild = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: PassThrough;
  kill: ReturnType<typeof vi.fn>;
  written: string[];
  closed: boolean;
};

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.stdin.on("data", (d: Buffer) => child.written.push(d.toString()));
  child.written = [];
  child.closed = false;
  child.kill = vi.fn(() => {
    child.closed = true;
    child.emit("exit", 1, "SIGKILL");
  });
  return child;
}

let rootDir: string;
let spawned: FakeChild[];
let spawnCalls: Array<{ command: string; args: string[]; cwd: string }>;
let pm: ProcessManager;

function instance(overrides: Partial<ServerRow> = {}): ServerRow {
  return {
    id: "srv-1",
    name: "Test Server",
    slug: "test-server",
    minecraftVersion: "1.21.4",
    loader: "fabric",
    loaderVersion: "0.16.10",
    javaPath: "java",
    serverDirectory: path.join(rootDir, "srv-1"),
    memoryMinMb: 1024,
    memoryMaxMb: 2048,
    port: 25565,
    status: "OFFLINE",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-pm-"));
  fs.mkdirSync(path.join(rootDir, "srv-1"));
  fs.writeFileSync(path.join(rootDir, "srv-1", "fabric-server-mc.1.21.4-launcher.jar"), "x");
  spawned = [];
  spawnCalls = [];
  const spawnFn: SpawnFn = (command, args, options) => {
    spawnCalls.push({ command, args, cwd: options.cwd });
    const child = fakeChild();
    spawned.push(child);
    return child;
  };
  pm = new ProcessManager({ spawnFn });
});

afterEach(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
});

describe("ProcessManager", () => {
  it("spawns Java with correct args and flags STARTING", () => {
    const states: Array<[string, string]> = [];
    pm.on("state", (id, status) => states.push([id, status]));
    pm.start(instance());
    expect(spawned).toHaveLength(1);
    expect(spawnCalls).toHaveLength(1);
    const call = spawnCalls[0];
    expect(call.command).toBe("java");
    expect(call.args).toEqual(["-Xms1024M", "-Xmx2048M", "-jar", "fabric-server-mc.1.21.4-launcher.jar", "nogui"]);
    expect(call.cwd).toBe(path.join(rootDir, "srv-1"));
    expect(states).toContainEqual(["srv-1", "STARTING"]);
    expect(pm.runningState("srv-1")).toBe("STARTING");
  });

  it("transitions to ONLINE when Done(...) appears", () => {
    pm.start(instance());
    const states: string[] = [];
    pm.on("state", (_id, s) => states.push(s));
    spawned[0].stdout.write("Starting Minecraft server on *:25565\n");
    spawned[0].stdout.write("Done (5.123s)! For help, type \"help\"\n");
    expect(states).toContain("ONLINE");
    expect(pm.runningState("srv-1")).toBe("ONLINE");
  });

  it("does not flip ONLINE on unrelated lines", () => {
    pm.start(instance());
    const states: string[] = [];
    pm.on("state", (_id, s) => states.push(s));
    spawned[0].stdout.write("Loading properties\n");
    expect(states).not.toContain("ONLINE");
  });

  it("rejects double start", () => {
    pm.start(instance());
    expect(() => pm.start(instance())).toThrow(ApiError);
    expect(spawned).toHaveLength(1);
  });

  it("rejects start when the server jar is missing", () => {
    fs.rmSync(path.join(rootDir, "srv-1", "fabric-server-mc.1.21.4-launcher.jar"));
    expect(() => pm.start(instance())).toThrow(/jar/);
    expect(spawned).toHaveLength(0);
  });

  it("rejects start when the directory is missing", () => {
    expect(() => pm.start(instance({ serverDirectory: path.join(rootDir, "nope") }))).toThrow(/directory/);
    expect(spawned).toHaveLength(0);
  });

  it("gracefully stops = OFFLINE after exit", async () => {
    pm.start(instance());
    spawned[0].stdout.write("Done (1.0s)! For help, type \"help\"\n");
    const stopPromise = pm.stop("srv-1");
    spawned[0].stdout.write("[Server thread/INFO]: Stopping the server\n");
    spawned[0].emit("exit", 0, null);
    await stopPromise;
    expect(pm.isRunning("srv-1")).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
  });

  it("sends the stop command to stdin", async () => {
    pm.start(instance());
    const p = pm.stop("srv-1");
    await new Promise((r) => setTimeout(r, 20));
    expect(spawned[0].written.join("")).toContain("stop\n");
    spawned[0].emit("exit", 0, null);
    await p;
  });

  it("marks unexpected exit as CRASHED", () => {
    const states: string[] = [];
    pm.on("state", (_id, s) => states.push(s));
    pm.start(instance());
    spawned[0].stdout.write("Done (1.0s)! For help, type \"help\"\n");
    spawned[0].emit("exit", 1, null);
    expect(pm.isRunning("srv-1")).toBe(false);
    expect(states).toContain("CRASHED");
  });

  it("restart stops and starts again", async () => {
    pm.start(instance());
    spawned[0].stdout.write("Done (1.0s)! For help, type \"help\"\n");
    const restartPromise = pm.restart(instance());
    spawned[0].emit("exit", 0, null);
    await restartPromise;
    expect(spawned).toHaveLength(2);
    expect(pm.runningState("srv-1")).toBe("STARTING");
  });

  it("rejects restart when not running", async () => {
    await expect(pm.restart(instance())).rejects.toThrow(ApiError);
  });

  it("forwards commands to stdin", () => {
    pm.start(instance());
    pm.sendCommand("srv-1", "say hello");
    expect(spawned[0].written.join("")).toContain("say hello\n");
  });

  it("rejects commands when not running", () => {
    expect(() => pm.sendCommand("srv-1", "say hi")).toThrow(ApiError);
  });

  it("rejects empty commands", () => {
    pm.start(instance());
    expect(() => pm.sendCommand("srv-1", "   ")).toThrow(/empty/);
  });

  it("rejects stop when not running", async () => {
    await expect(pm.stop("srv-1")).rejects.toThrow(ApiError);
  });

  it("buffers console lines and reports them before cleanup", () => {
    pm.start(instance());
    spawned[0].stdout.write("line one\nline two\n");
    spawned[0].stderr.write("stderr line\n");
    const buf = pm.consoleLines("srv-1");
    expect(buf).toContain("line one");
    expect(buf).toContain("line two");
    expect(buf).toContain("stderr line");
  });

  it("reports java launch errors (missing executable) as CRASHED", () => {
    const child = fakeChild();
    const spawnFn: SpawnFn = () => child;
    pm = new ProcessManager({ spawnFn });
    const states: string[] = [];
    const lines: string[] = [];
    pm.on("state", (_id, s) => states.push(s));
    pm.on("console", (_id, line) => lines.push(line));
    pm.start(instance());
    const error = new Error("spawn java ENOENT") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    child.emit("error", error);
    expect(pm.isRunning("srv-1")).toBe(false);
    expect(states).toContain("CRASHED");
    expect(lines.some((l) => l.includes("java process error"))).toBe(true);
  });
});
