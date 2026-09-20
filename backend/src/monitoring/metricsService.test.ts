import { describe, it, expect, vi } from "vitest";
import { MetricsService, type MetricsServiceDeps } from "./metricsService.js";
import type { HubEvent } from "../websocket/hub.js";
import type { RawProcessMetrics } from "./processMetrics.js";

interface Handlers {
  started: (serverId: string, pid: number, startedAt: number) => void;
  state: (serverId: string, status: string) => void;
  console: (serverId: string, line: string, timestamp: number) => void;
}

function makeDeps(overrides: Partial<MetricsServiceDeps> = {}) {
  const handlers = {} as Handlers;
  const broadcast = vi.fn<(event: HubEvent) => void>();
  const now = vi.fn(() => 100_000);
  const divBytes = (mb: number) => mb * 1024 * 1024;

  const deps: MetricsServiceDeps = {
    readFn: vi.fn(async () => null),
    sampleIntervalMs: 60_000,
    now,
    broadcast,
    assertServer: () => undefined,
    onStarted: (cb) => {
      handlers.started = cb as Handlers["started"];
    },
    onState: (cb) => {
      handlers.state = cb as Handlers["state"];
    },
    onConsole: (cb) => {
      handlers.console = cb as Handlers["console"];
    },
    ...overrides,
  };
  return { deps, handlers, broadcast, now, divBytes };
}

describe("MetricsService sampling", () => {
  it("collects memory immediately and CPU% from the second sample", async () => {
    const { deps, handlers, broadcast, now } = makeDeps();
    const service = new MetricsService(deps);
    const readFn = deps.readFn as ReturnType<typeof vi.fn>;
    readFn.mockResolvedValueOnce({ cpuSeconds: 5, memoryBytes: 1024 * 1024 * 1024 });
    readFn.mockResolvedValueOnce({ cpuSeconds: 5.5, memoryBytes: 512 * 1024 * 1024 });

    handlers.started("srv-1", 42, 0);
    now.mockReturnValueOnce(1000);
    await service.sampleNow();
    now.mockReturnValueOnce(2000);
    await service.sampleNow();

    expect(broadcast).toHaveBeenCalledTimes(2);
    const first = broadcast.mock.calls[0]![0];
    expect(first).toMatchObject({ type: "server.metrics", serverId: "srv-1", pid: 42, snapshot: { cpuPercent: null, memoryMb: 1024 } });
    const second = broadcast.mock.calls[1]![0];
    expect(second).toMatchObject({ type: "server.metrics", snapshot: { cpuPercent: 50, memoryMb: 512 } });
  });

  it("caps history at HISTORY_LIMIT samples", async () => {
    const { deps, handlers } = makeDeps();
    const service = new MetricsService(deps);
    const readFn = deps.readFn as ReturnType<typeof vi.fn>;
    handlers.started("srv-1", 42, 0);

    let sample = 0;
    for (let i = 0; i < 150; i += 1) {
      sample += 1;
      readFn.mockResolvedValueOnce({ cpuSeconds: sample, memoryBytes: 256 * 1024 * 1024 });
      await service.sampleNow();
    }

    const result = service.snapshot("srv-1");
    expect(result.history.length).toBe(144);
    expect(result.history[result.history.length - 1]!.memoryMb).toBe(256);
  });

  it("keeps a server running after a failed read", async () => {
    const { deps, handlers } = makeDeps();
    const service = new MetricsService(deps);
    const readFn = deps.readFn as ReturnType<typeof vi.fn>;
    handlers.started("srv-1", 42, 0);

    readFn.mockResolvedValueOnce(null);
    await service.sampleNow();

    const result = service.snapshot("srv-1");
    expect(result.running).toBe(true);
    expect(result.snapshot).toBeNull();
  });

  it("clears tracking when the server stops", async () => {
    const { deps, handlers } = makeDeps();
    const service = new MetricsService(deps);
    handlers.started("srv-1", 42, 0);
    handlers.state("srv-1", "CRASHED");

    expect(service.snapshot("srv-1").running).toBe(false);
  });

  it("delegates existence checks to assertServer", async () => {
    const assertServer = vi.fn();
    const { deps } = makeDeps({ assertServer });
    const service = new MetricsService(deps);
    service.snapshot("srv-404");
    expect(assertServer).toHaveBeenCalledWith("srv-404");
  });
});

describe("MetricsService players", () => {
  it("tracks joins and leaves from console lines", () => {
    const { deps, handlers, broadcast } = makeDeps();
    const service = new MetricsService(deps);
    handlers.started("srv-1", 42, 0);

    handlers.console("srv-1", "[21:00:01] [Server thread/INFO]: Steve joined the game", 100);
    handlers.console("srv-1", "[21:00:03] [Server thread/INFO]: Alex joined the game", 102);
    handlers.console("srv-1", "[21:01:00] [Server thread/INFO]: Steve left the game", 160);

    expect(service.players("srv-1").online).toEqual(["Alex"]);
    expect(service.players("srv-1").activity).toHaveLength(3);
    expect(service.players("srv-1").activity[2]).toMatchObject({ player: "Steve", action: "left", timestamp: 160 });

    const events = broadcast.mock.calls.map(([e]) => e).filter((e): e is HubEvent & { type: "server.playerActivity" } => e.type === "server.playerActivity");
    expect(events).toHaveLength(3);
    expect(events[0]!.online).toEqual(["Steve"]);
    expect(events[1]!.online).toEqual(["Steve", "Alex"]);
    expect(events[2]!.online).toEqual(["Alex"]);
  });

  it("ignores non-player console lines", () => {
    const { deps, handlers } = makeDeps();
    const service = new MetricsService(deps);
    handlers.started("srv-1", 42, 0);

    handlers.console("srv-1", "[Server thread/INFO]: Starting minecraft server version 1.21", 100);
    handlers.console("srv-1", "[Server thread/INFO]: Steve left the game room", 101);

    expect(service.players("srv-1").online).toEqual([]);
  });

  it("does not track players when the server is not running", () => {
    const { deps, handlers } = makeDeps();
    const service = new MetricsService(deps);
    handlers.console("srv-1", "Steve joined the game", 100);
    expect(service.players("srv-1").online).toEqual([]);
  });
});