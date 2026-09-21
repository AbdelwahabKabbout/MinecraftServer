import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface LaunchOptions {
  java: string;
  serverJar: string;
  workingDir: string;
  memoryMinMb: number;
  memoryMaxMb: number;
  stdio?: "inherit" | "pipe";
}

/** Resolves the launcher jar: prefer a fabric-server-*.jar, fall back to server.jar. */
export function resolveServerJar(workingDir: string): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(workingDir);
  } catch {
    return null;
  }
  const fabric = entries.find((entry) => entry.toLowerCase().startsWith("fabric-server-") && entry.toLowerCase().endsWith(".jar"));
  if (fabric) return fabric;
  const server = entries.find((entry) => entry.toLowerCase() === "server.jar");
  return server ?? null;
}

export type LaunchResult =
  | { started: true; child: ChildProcess; command: string[] }
  | { started: false; error: string };

export function launchServer(options: LaunchOptions, spawnFn: typeof spawn = spawn): LaunchResult {
  if (!fs.existsSync(options.serverJar)) {
    return { started: false, error: `Server jar not found: ${options.serverJar}` };
  }
  const args = ["-Xms" + `${options.memoryMinMb}M`, `-Xmx${options.memoryMaxMb}M`, "-jar", options.serverJar, "nogui"];
  const child = spawnFn(options.java, args, {
    cwd: options.workingDir,
    stdio: options.stdio ?? "inherit",
    shell: false,
  });
  child.on("error", () => {});
  return { started: true, child, command: args };
}