import { readProcessMetrics, computeCpuPercent, bytesToMb, type RawProcessMetrics } from "../monitoring/processMetrics.js";
import { wsHub, type HubEvent } from "../websocket/hub.js";
import { processManager } from "../minecraft/processManager.js";
import { serverRepository } from "../repositories/serverRepository.js";
import type { ServerStatus } from "../minecraft/serverState.js";

const SAMPLE_INTERVAL_MS = 5000;
const HISTORY_LIMIT = 144; // ~12 minutes at 5s
const ACTIVITY_LIMIT = 100;

export interface MetricsSample {
  timestamp: number;
  cpuPercent: number | null;
  memoryMb: number;
}

export interface PlayerActivity {
  player: string;
  action: "joined" | "left";
  timestamp: number;
}

export interface MetricsServiceDeps {
  readFn: (pid: number) => Promise<RawProcessMetrics | null>;
  sampleIntervalMs: number;
  now: () => number;
  broadcast: (event: HubEvent) => void;
  assertServer: (serverId: string) => void;
  onStarted: (cb: (serverId: string, pid: number, startedAt: number) => void) => void;
  onState: (cb: (serverId: string, status: ServerStatus) => void) => void;
  onConsole: (cb: (serverId: string, line: string, timestamp: number) => void) => void;
}

interface Runnable {
  pid: number;
  startedAt: number;
  lastCpuSec: number | null;
  lastAt: number;
  samples: MetricsSample[];
  online: Set<string>;
  activity: PlayerActivity[];
}

const JOIN_PATTERN = /\b([A-Za-z0-9_]{1,16}) joined the game\b/;
const LEFT_PATTERN = /\b([A-Za-z0-9_]{1,16}) left the game\b/;

/**
 * Samples CPU/RAM for every running server and tracks joins/leaves from
 * console output. Samples are broadcast as `server.metrics`; player changes as
 * `server.playerActivity`.
 */
export class MetricsService {
  private readonly runnables = new Map<string, Runnable>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: MetricsServiceDeps) {
    deps.onStarted((serverId, pid, startedAt) => this.onStarted(serverId, pid, startedAt));
    deps.onState((serverId, status) => {
      if (status === "CRASHED" || status === "OFFLINE") this.onStopped(serverId);
    });
    deps.onConsole((serverId, line, timestamp) => this.handleConsoleLine(serverId, line, timestamp));
  }

  private onStarted(serverId: string, pid: number, startedAt: number): void {
    if (!Number.isInteger(pid) || pid <= 0) return;
    this.runnables.delete(serverId);
    this.runnables.set(serverId, {
      pid,
      startedAt,
      lastCpuSec: null,
      lastAt: startedAt,
      samples: [],
      online: new Set<string>(),
      activity: [],
    });
    this.ensureTimer();
  }

  private onStopped(serverId: string): void {
    this.runnables.delete(serverId);
    this.broadcastMetrics(serverId);
  }

  handleConsoleLine(serverId: string, line: string, timestamp: number): void {
    const runnable = this.runnables.get(serverId);
    if (!runnable) return;

    const joined = JOIN_PATTERN.exec(line);
    if (joined) {
      this.recordPlayer(serverId, runnable, joined[1]!, "joined", timestamp);
      return;
    }
    const left = LEFT_PATTERN.exec(line);
    if (left) {
      this.recordPlayer(serverId, runnable, left[1]!, "left", timestamp);
    }
  }

  private recordPlayer(serverId: string, runnable: Runnable, player: string, action: "joined" | "left", timestamp: number): void {
    if (action === "joined") runnable.online.add(player);
    else runnable.online.delete(player);

    runnable.activity.push({ player, action, timestamp });
    if (runnable.activity.length > ACTIVITY_LIMIT) runnable.activity.splice(0, runnable.activity.length - ACTIVITY_LIMIT);

    this.deps.broadcast({
      type: "server.playerActivity",
      serverId,
      player,
      action,
      timestamp,
      online: [...runnable.online],
    });
  }

  snapshot(serverId: string): {
    running: boolean;
    pid: number | null;
    startedAt: number | null;
    snapshot: MetricsSample | null;
    history: MetricsSample[];
  } {
    this.deps.assertServer(serverId);
    const runnable = this.runnables.get(serverId);
    if (!runnable) {
      return { running: false, pid: null, startedAt: null, snapshot: null, history: [] };
    }
    const samples = runnable.samples;
    return {
      running: true,
      pid: runnable.pid,
      startedAt: runnable.startedAt,
      snapshot: samples.length > 0 ? samples[samples.length - 1]! : null,
      history: samples,
    };
  }

  players(serverId: string): {
    running: boolean;
    online: string[];
    activity: PlayerActivity[];
  } {
    this.deps.assertServer(serverId);
    const runnable = this.runnables.get(serverId);
    if (!runnable) {
      return { running: false, online: [], activity: [] };
    }
    return { running: true, online: [...runnable.online], activity: [...runnable.activity] };
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sampleNow(): Promise<void> {
    const entries = [...this.runnables.entries()];
    await Promise.all(
      entries.map(async ([serverId, runnable]) => {
        const raw = await this.deps.readFn(runnable.pid);
        if (!raw) return;
        const now = this.deps.now();
        const cpuPercent =
          runnable.lastCpuSec !== null
            ? computeCpuPercent(runnable.lastCpuSec, raw.cpuSeconds, runnable.lastAt / 1000, now / 1000)
            : null;
        runnable.lastCpuSec = raw.cpuSeconds;
        runnable.lastAt = now;
        runnable.samples.push({ timestamp: now, cpuPercent, memoryMb: bytesToMb(raw.memoryBytes) });
        if (runnable.samples.length > HISTORY_LIMIT) runnable.samples.splice(0, runnable.samples.length - HISTORY_LIMIT);
        this.broadcastMetrics(serverId);
      }),
    );
  }

  private broadcastMetrics(serverId: string): void {
    const { running, pid, startedAt, snapshot } = this.snapshot(serverId);
    this.deps.broadcast({ type: "server.metrics", serverId, running, pid, startedAt, snapshot });
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.sampleNow().catch(() => undefined);
    }, this.deps.sampleIntervalMs);
    this.timer.unref?.();
  }
}

export const metricsService = new MetricsService({
  readFn: readProcessMetrics,
  sampleIntervalMs: SAMPLE_INTERVAL_MS,
  now: () => Date.now(),
  broadcast: (event) => wsHub.broadcast(event),
  assertServer: (serverId) => serverRepository.getOrThrow(serverId),
  onStarted: (cb) => processManager.on("started", cb),
  onState: (cb) => processManager.on("state", cb),
  onConsole: (cb) => processManager.on("console", cb),
});