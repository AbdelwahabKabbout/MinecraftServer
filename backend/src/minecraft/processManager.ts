import { spawn, type ChildProcess } from "node:child_process";
import { ApiError } from "../utils/api.js";
import { logger } from "../config/logger.js";
import { env } from "../config/index.js";
import {
  SERVER_STATUSES,
  type ServerStatus,
} from "./serverState.js";
import { detectServerDirectory } from "./detection.js";
import type { ServerRow } from "../db/schema.js";

export type SpawnFn = (
  command: string,
  args: string[],
  options: { cwd: string },
) => ChildProcess;

export interface ProcessManagerEvents {
  state: (serverId: string, status: ServerStatus, info?: string) => void;
  console: (serverId: string, line: string, timestamp: number) => void;
}

interface RunningInstance {
  instance: ServerRow;
  child: ChildProcess;
  state: ServerStatus;
  startedAt: number;
  buffer: string[];
  remainingStdout: string;
  remainingStderr: string;
  stopTimer: ReturnType<typeof setTimeout> | null;
}

const CONSOLE_BUFFER_LIMIT = 1000;

const ONLINE_DONE_PATTERN = /Done \(/;

function defaultSpawn(command: string, args: string[], options: { cwd: string }): ChildProcess {
  return spawn(command, args, { cwd: options.cwd, windowsHide: true });
}

/**
 * Manages the lifecycle of Java Minecraft server processes.
 *
 * Safety: the command and its arguments are constructed exclusively from
 * validated server configuration — never from user-supplied command strings.
 */
export class ProcessManager {
  private running = new Map<string, RunningInstance>();
  private readonly listeners: { [K in keyof ProcessManagerEvents]: Set<ProcessManagerEvents[K]> } = {
    state: new Set(),
    console: new Set(),
  };
  private readonly spawnFn: SpawnFn;

  constructor(options: { spawnFn?: SpawnFn } = {}) {
    this.spawnFn = options.spawnFn ?? defaultSpawn;
  }

  on<K extends keyof ProcessManagerEvents>(event: K, listener: ProcessManagerEvents[K]): void {
    this.listeners[event].add(listener as never);
  }

  private emit<K extends keyof ProcessManagerEvents>(
    event: K,
    ...args: Parameters<ProcessManagerEvents[K]>
  ): void {
    for (const listener of this.listeners[event]) {
      try {
        (listener as (...a: Parameters<ProcessManagerEvents[K]>) => void)(...args);
      } catch (error) {
        logger.error({ error }, `ProcessManager listener error (${String(event)})`);
      }
    }
  }

  isRunning(serverId: string): boolean {
    return this.running.has(serverId);
  }

  runningState(serverId: string): ServerStatus | null {
    return this.running.get(serverId)?.state ?? null;
  }

  consoleLines(serverId: string): string[] {
    return this.running.get(serverId)?.buffer ?? [];
  }

  private pushLine(serverId: string, line: string, timestamp = Date.now()): void {
    const run = this.running.get(serverId);
    if (!run) return;
    run.buffer.push(line);
    if (run.buffer.length > CONSOLE_BUFFER_LIMIT) run.buffer.splice(0, run.buffer.length - CONSOLE_BUFFER_LIMIT);
    this.emit("console", serverId, line, timestamp);
    if (run.state === "STARTING" && ONLINE_DONE_PATTERN.test(line)) {
      this.setState(serverId, "ONLINE");
    }
  }

  private setState(serverId: string, status: ServerStatus, info?: string): void {
    const run = this.running.get(serverId);
    if (!run || run.state === status) return;
    const from = run.state;
    const allowed =
      (from === "STARTING" && (status === "ONLINE" || status === "STOPPING" || status === "CRASHED")) ||
      (from === "ONLINE" && (status === "STOPPING" || status === "CRASHED")) ||
      (from === "STOPPING" && status === "OFFLINE");
    if (!allowed) {
      logger.warn({ serverId, from, status }, "Ignoring invalid process state transition");
      return;
    }
    run.state = status;
    logger.info({ serverId, from, to: status }, `Server ${status}`);
    this.emit("state", serverId, status, info);
  }

  start(instance: ServerRow): void {
    if (this.running.has(instance.id)) {
      throw new ApiError("SERVER_ALREADY_RUNNING", `Server "${instance.name}" is already running.`, 409);
    }

    const detection = detectServerDirectory(instance.serverDirectory);
    if (!detection.exists) {
      throw new ApiError(
        "SERVER_DIRECTORY_MISSING",
        `Server directory does not exist: ${instance.serverDirectory}. Create it or point the instance at an existing server.`,
        400,
      );
    }
    if (!detection.serverJar) {
      throw new ApiError(
        "SERVER_JAR_MISSING",
        `Server cannot start. Missing: server jar (fabric-server-*-launcher.jar or server.jar) in ${instance.serverDirectory}.`,
        400,
      );
    }

    const args = [
      `-Xms${instance.memoryMinMb}M`,
      `-Xmx${instance.memoryMaxMb}M`,
      "-jar",
      detection.serverJar,
      "nogui",
    ];

    let child: ChildProcess;
    try {
      child = this.spawnFn(instance.javaPath, args, { cwd: instance.serverDirectory });
    } catch (error) {
      logger.error({ serverId: instance.id, error }, "Failed to spawn Java process");
      throw new ApiError("JAVA_LAUNCH_FAILED", `Failed to launch Java process for "${instance.name}".`, 500);
    }

    const run: RunningInstance = {
      instance,
      child,
      state: "STARTING",
      startedAt: Date.now(),
      buffer: [],
      remainingStdout: "",
      remainingStderr: "",
      stopTimer: null,
    };
    this.running.set(instance.id, run);
    this.emit("state", instance.id, "STARTING");

    this.pushLine(instance.id, `[manager] launching: ${instance.javaPath} ${args.join(" ")}`);

    child.stdout?.on("data", (chunk: Buffer) => {
      this.consumeChunk(instance.id, chunk, "stdout");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      this.consumeChunk(instance.id, chunk, "stderr");
    });

    child.on("error", (error) => {
      this.pushLine(instance.id, `[manager] java process error: ${error.message}`);
      logger.error({ serverId: instance.id, error }, "Java process errored");
      const runNow = this.running.get(instance.id);
      if (runNow && runNow.state !== "STOPPING") {
        this.setState(instance.id, "CRASHED");
      }
      this.cleanup(instance.id, (error instanceof Error && "code" in error ? String((error as NodeJS.ErrnoException).code) : "UNKNOWN"));
    });

    child.on("exit", (code, signal) => {
      const runNow = this.running.get(instance.id);
      if (!runNow) return;
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      this.pushLine(instance.id, `[manager] process ended (${reason})`);
      const next: ServerStatus = runNow.state === "STOPPING" ? "OFFLINE" : "CRASHED";
      this.setState(instance.id, next, reason);
      this.cleanup(instance.id, reason);
    });
  }

  private consumeChunk(serverId: string, chunk: Buffer, stream: "stdout" | "stderr"): void {
    const run = this.running.get(serverId);
    if (!run) return;
    const text = chunk.toString("utf8");
    const accumulated = stream === "stdout" ? run.remainingStdout + text : run.remainingStderr + text;
    const lines = accumulated.split(/\r?\n/);
    const remainder = lines.pop() ?? "";
    if (stream === "stdout") run.remainingStdout = remainder;
    else run.remainingStderr = remainder;

    for (const line of lines) {
      if (line.length === 0) continue;
      this.pushLine(serverId, line);
    }
  }

  private flushRemainder(serverId: string): void {
    const run = this.running.get(serverId);
    if (!run) return;
    if (run.remainingStdout.trim()) this.pushLine(serverId, run.remainingStdout.trim());
    if (run.remainingStderr.trim()) this.pushLine(serverId, run.remainingStderr.trim());
    run.remainingStdout = "";
    run.remainingStderr = "";
  }

  private cleanup(serverId: string, reason: string): void {
    const run = this.running.get(serverId);
    if (!run) return;
    if (run.remainingStdout || run.remainingStderr) this.flushRemainder(serverId);
    if (run.stopTimer) clearTimeout(run.stopTimer);
    this.running.delete(serverId);
    logger.info({ serverId, reason }, "Process manager cleanup");
  }

  /**
   * Gracefully stops the server by sending `stop`, waiting for the configured
   * timeout, and killing the process only if it does not exit in time.
   * Resolves once the process has fully exited and been cleaned up.
   */
  stop(serverId: string): Promise<void> {
    const run = this.running.get(serverId);
    if (!run) {
      return Promise.reject(new ApiError("SERVER_NOT_RUNNING", "The server is not running.", 409));
    }

    this.setState(serverId, "STOPPING");
    this.pushLine(serverId, "[manager] stop requested");
    try {
      run.child.stdin?.write("stop\n");
    } catch (error) {
      logger.warn({ serverId, error }, "Failed to write stop command");
    }

    return new Promise<void>((resolve) => {
      run.stopTimer = setTimeout(() => {
        if (this.running.has(serverId)) {
          this.pushLine(serverId, "[manager] graceful shutdown timed out; force-stopping");
          logger.warn({ serverId }, "Graceful shutdown timed out, force-stopping");
          run.child.kill("SIGKILL");
        }
      }, env.SHUTDOWN_TIMEOUT_MS);

      const poll = setInterval(() => {
        if (!this.running.has(serverId)) {
          clearInterval(poll);
          if (run.stopTimer !== null) clearTimeout(run.stopTimer);
          resolve();
        }
      }, 50);
    });
  }

  /** Stops then restarts the same instance. Requires the current instance. */
  async restart(instance: ServerRow): Promise<void> {
    if (!this.running.has(instance.id)) {
      throw new ApiError("SERVER_NOT_RUNNING", "The server is not running.", 409);
    }
    await this.stop(instance.id);
    this.start(instance);
  }

  sendCommand(serverId: string, command: string): void {
    const trimmed = command.trim();
    if (trimmed === "") {
      throw new ApiError("EMPTY_COMMAND", "Command must not be empty.", 400);
    }
    const run = this.running.get(serverId);
    if (!run) {
      throw new ApiError("SERVER_NOT_RUNNING", "The server is not running.", 409);
    }
    try {
      run.child.stdin?.write(`${trimmed}\n`);
      this.pushLine(serverId, `[manager] > ${trimmed}`);
    } catch (error) {
      logger.warn({ serverId, error }, "Failed to write command");
      throw new ApiError("COMMAND_WRITE_FAILED", "Failed to deliver the command to the server.", 500);
    }
  }
}

export function isKnownStatus(value: string): value is ServerStatus {
  return (SERVER_STATUSES as readonly string[]).includes(value);
}

export const processManager = new ProcessManager();