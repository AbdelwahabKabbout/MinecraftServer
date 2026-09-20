import { randomUUID } from "node:crypto";
import path from "node:path";
import type { NewServerRow, ServerRow } from "../db/schema.js";
import { serverRepository } from "../repositories/serverRepository.js";
import { paths, env } from "../config/index.js";
import { resolveSafePath } from "../utils/pathSafety.js";
import { slugify, uniqueSlug } from "../utils/slugify.js";
import { detectServerDirectory, type DetectionReport } from "../minecraft/detection.js";
import { processManager } from "../minecraft/processManager.js";
import { wsHub } from "../websocket/hub.js";
import { ApiError } from "../utils/api.js";
import { isServerStatus } from "../minecraft/serverState.js";
import { logger } from "../config/logger.js";
import { consoleService } from "./consoleService.js";

const DEFAULT_PORT = 25565;

export interface ServerCreateInput {
  name: string;
  minecraftVersion?: string;
  loader?: string;
  loaderVersion?: string;
  javaPath?: string;
  serverDirectory: string;
  memoryMinMb?: number;
  memoryMaxMb?: number;
  port?: number;
}

export interface ServerUpdateInput {
  name?: string;
  minecraftVersion?: string | null;
  loader?: string;
  loaderVersion?: string | null;
  javaPath?: string;
  serverDirectory?: string;
  memoryMinMb?: number;
  memoryMaxMb?: number;
  port?: number;
}

/** Normalizes an instance-specific directory to a relative path under serverRoot. */
function normalizeDirectory(input: string): string {
  const safe = resolveSafePath(paths.serverRoot, input);
  const rel = path.relative(paths.serverRoot, safe);
  return rel.split(path.sep).join("/");
}

export class ServerService {
  constructor() {
    processManager.on("state", (serverId, status) => {
      serverRepository
        .patchStatus(serverId, status)
        .catch((error) => logger.warn({ serverId, error }, "Failed to persist server status"));
      wsHub.broadcast({ type: "server.status", serverId, status });
    });
    processManager.on("console", (serverId, line, timestamp) => {
      consoleService.handleLine(serverId, line, timestamp);
      wsHub.broadcast({ type: "server.console", serverId, line, timestamp });
    });
  }

  async list(): Promise<ServerRow[]> {
    return serverRepository.list();
  }

  async get(id: string): Promise<ServerRow> {
    return serverRepository.get(id);
  }

  async create(input: ServerCreateInput): Promise<ServerRow> {
    const existing = serverRepository.list();
    const slugs = new Set(existing.map((s) => s.slug));
    const slug = uniqueSlug(slugify(input.name), slugs);
    const directory = normalizeDirectory(input.serverDirectory);

    await this.assertDirectoryFree(directory);

    const row: Omit<NewServerRow, "createdAt" | "updatedAt"> = {
      id: randomUUID(),
      name: input.name.trim(),
      slug,
      minecraftVersion: input.minecraftVersion?.trim() || null,
      loader: (input.loader?.trim() || "fabric").toLowerCase(),
      loaderVersion: input.loaderVersion?.trim() || null,
      javaPath: (input.javaPath ?? env.JAVA_PATH).trim(),
      serverDirectory: directory,
      memoryMinMb: resolveMemory(input.memoryMinMb, env.MEMORY_MIN_MB),
      memoryMaxMb: resolveMemory(input.memoryMaxMb, env.MEMORY_MAX_MB),
      port: clampPort(input.port ?? DEFAULT_PORT),
      status: "OFFLINE",
    };
    return serverRepository.create(row);
  }

  async update(id: string, input: ServerUpdateInput): Promise<ServerRow> {
    const current = await serverRepository.get(id);
    if (processManager.isRunning(id)) {
      throw new ApiError("SERVER_RUNNING_CANNOT_MODIFY", "Stop the server before changing its configuration.", 409);
    }

    const changes: Partial<NewServerRow> = {};
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.minecraftVersion !== undefined) changes.minecraftVersion = input.minecraftVersion?.trim() || null;
    if (input.loader !== undefined) changes.loader = input.loader.trim().toLowerCase();
    if (input.loaderVersion !== undefined) changes.loaderVersion = input.loaderVersion?.trim() || null;
    if (input.javaPath !== undefined) changes.javaPath = input.javaPath.trim();
    if (input.memoryMinMb !== undefined) changes.memoryMinMb = resolveMemory(input.memoryMinMb, current.memoryMinMb);
    if (input.memoryMaxMb !== undefined) changes.memoryMaxMb = resolveMemory(input.memoryMaxMb, current.memoryMaxMb);
    if (input.port !== undefined) changes.port = clampPort(input.port);

    if (input.serverDirectory !== undefined) {
      const directory = normalizeDirectory(input.serverDirectory);
      if (directory !== current.serverDirectory) {
        await this.assertDirectoryFree(directory, current.id);
        changes.serverDirectory = directory;
      }
    }

    return serverRepository.update(id, changes);
  }

  async remove(id: string): Promise<void> {
    const current = await serverRepository.get(id);
    if (processManager.isRunning(id)) {
      throw new ApiError("SERVER_RUNNING_CANNOT_DELETE", "Stop the server before deleting it.", 409);
    }
    await serverRepository.delete(id);
    consoleService.clear(id);
  }

  status(id: string): { instance: ServerRow; status: string; running: boolean } {
    const instance = serverRepository.getOrThrow(id);
    const running = processManager.isRunning(id);
    const status = running ? (processManager.runningState(id) ?? instance.status) : instance.status;
    return { instance, status, running };
  }

  detect(id: string): { instance: ServerRow; report: DetectionReport } {
    const instance = serverRepository.getOrThrow(id);
    const absolute = resolveSafePath(paths.serverRoot, instance.serverDirectory);
    return { instance, report: detectServerDirectory(absolute) };
  }

  async start(id: string): Promise<void> {
    const instance = serverRepository.getOrThrow(id);
    const absolute = resolveSafePath(paths.serverRoot, instance.serverDirectory);
    processManager.start({ ...instance, serverDirectory: absolute });
  }

  async stop(id: string): Promise<void> {
    await processManager.stop(id);
  }

  async restart(id: string): Promise<void> {
    const instance = serverRepository.getOrThrow(id);
    const absolute = resolveSafePath(paths.serverRoot, instance.serverDirectory);
    if (!processManager.isRunning(id)) {
      throw new ApiError("SERVER_NOT_RUNNING", "The server is not running.", 409);
    }
    await processManager.stop(id);
    processManager.start({ ...instance, serverDirectory: absolute });
  }

  sendCommand(id: string, command: string): void {
    processManager.sendCommand(id, command);
  }

  consoleLines(id: string, limit?: number): Array<{ line: string; timestamp: number }> {
    serverRepository.getOrThrow(id);
    return consoleService.history(id, limit);
  }

  clearConsole(id: string): { id: string; cleared: boolean; removed: number } {
    serverRepository.getOrThrow(id);
    const { removed } = consoleService.clear(id);
    wsHub.broadcast({ type: "server.consoleCleared", serverId: id });
    return { id, cleared: true, removed };
  }

  private async assertDirectoryFree(directory: string, exceptId?: string): Promise<void> {
    const absolute = resolveSafePath(paths.serverRoot, directory);
    const collision = serverRepository
      .list()
      .find((s) => s.id !== exceptId && path.resolve(paths.serverRoot, s.serverDirectory) === absolute);
    if (collision) {
      throw new ApiError(
        "SERVER_DIRECTORY_IN_USE",
        `Server directory "${directory}" is already used by "${collision.name}".`,
        409,
      );
    }
  }
}

function resolveMemory(value: number | undefined, fallback: number): number {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError("INVALID_MEMORY", "Memory must be a positive integer (MB).", 400);
  }
  return n;
}

function clampPort(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ApiError("INVALID_PORT", "Port must be an integer between 1 and 65535.", 400);
  }
  return value;
}

export function validateStatusTransitionOnRead(value: string): string {
  return isServerStatus(value) ? value : "UNKNOWN";
}

export const serverService = new ServerService();