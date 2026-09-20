import { defineStore } from "pinia";
import {
  serverService,
  type ManagedServer,
  type ServerCreatePayload,
  type ServerUpdatePayload,
  type DetectionReport,
  type ServerStatus,
  type ConsoleLine,
  type ServerPropertiesDoc,
  type ServerPropertiesPatch,
  type ServerMetricsDoc,
  type PlayersDoc,
  type PlayerActivity,
} from "@/services/servers";
import { WsClient, type HubEvent } from "@/services/websocket";
import { ApiClientError } from "@/services/api";

const liveClient = new WsClient();

const MAX_CONSOLE_LINES = 2000;

interface ServerViewState {
  servers: ManagedServer[];
  loading: boolean;
  error: string | null;
  detections: Record<string, DetectionReport>;
  consoleLines: Record<string, ConsoleLine[]>;
  properties: Record<string, ServerPropertiesDoc>;
  metrics: Record<string, ServerMetricsDoc>;
  players: Record<string, PlayersDoc>;
  live: boolean;
  connectedOnce: boolean;
}

export const useServersStore = defineStore("servers", {
  state: (): ServerViewState => ({
    servers: [],
    loading: false,
    error: null,
    detections: {},
    consoleLines: {},
    properties: {},
    metrics: {},
    players: {},
    live: false,
    connectedOnce: false,
  }),

  getters: {
    byId: (state) => (id: string): ManagedServer | undefined =>
      state.servers.find((s) => s.id === id),
    consoleById: (state) => (id: string): ConsoleLine[] => state.consoleLines[id] ?? [],
    count: (state): number => state.servers.length,
    runningCount: (state): number =>
      state.servers.filter((s) => s.status === "STARTING" || s.status === "ONLINE" || s.status === "STOPPING").length,
  },

  actions: {
    async fetchServers(): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        this.servers = await serverService.list();
      } catch (error) {
        this.error = this.messageFor(error);
      } finally {
        this.loading = false;
      }
    },

    async fetchServer(id: string): Promise<ManagedServer | undefined> {
      try {
        const server = await serverService.get(id);
        const index = this.servers.findIndex((s) => s.id === id);
        if (index === -1) this.servers.push(server);
        else this.servers[index] = server;
        return server;
      } catch (error) {
        this.error = this.messageFor(error);
        return undefined;
      }
    },

    async create(payload: ServerCreatePayload): Promise<ManagedServer | null> {
      try {
        const server = await serverService.create(payload);
        this.servers.push(server);
        return server;
      } catch (error) {
        throw this.asError(error);
      }
    },

    async update(id: string, payload: ServerUpdatePayload): Promise<ManagedServer | null> {
      try {
        const server = await serverService.update(id, payload);
        const index = this.servers.findIndex((s) => s.id === id);
        if (index !== -1) this.servers[index] = server;
        return server;
      } catch (error) {
        throw this.asError(error);
      }
    },

    async remove(id: string): Promise<void> {
      try {
        await serverService.remove(id);
        this.servers = this.servers.filter((s) => s.id !== id);
      } catch (error) {
        throw this.asError(error);
      }
    },

    async detect(id: string): Promise<DetectionReport | null> {
      try {
        const report = await serverService.detect(id);
        this.detections[id] = report;
        return report;
      } catch (error) {
        this.error = this.messageFor(error);
        return null;
      }
    },

    async hydrateConsole(id: string, limit = 500): Promise<void> {
      try {
        const { lines } = await serverService.consoleHistory(id, limit);
        const existing = this.consoleLines[id] ?? [];
        const seen = new Set<string>();
        const merged = [...lines, ...existing]
          .filter((entry) => {
            const key = `${entry.timestamp}:${entry.line}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-MAX_CONSOLE_LINES);
        this.consoleLines[id] = merged;
      } catch (error) {
        this.error = this.messageFor(error);
      }
    },

    async clearConsole(id: string): Promise<boolean> {
      try {
        const result = await serverService.clearConsole(id);
        if (result.cleared) this.consoleLines[id] = [];
        return result.cleared;
      } catch (error) {
        this.error = this.messageFor(error);
        return false;
      }
    },

    async sendCommand(id: string, command: string): Promise<boolean> {
      try {
        await serverService.command(id, command);
        return true;
      } catch (error) {
        this.error = this.messageFor(error);
        return false;
      }
    },

    async fetchProperties(id: string): Promise<ServerPropertiesDoc | null> {
      try {
        const doc = await serverService.properties(id);
        this.properties[id] = doc;
        return doc;
      } catch (error) {
        this.error = this.messageFor(error);
        return null;
      }
    },

    async saveProperties(id: string, payload: ServerPropertiesPatch): Promise<ServerPropertiesDoc | null> {
      try {
        const doc = await serverService.saveProperties(id, payload);
        this.properties[id] = doc;
        return doc;
      } catch (error) {
        throw this.asError(error);
      }
    },

    async fetchMetrics(id: string): Promise<void> {
      try {
        this.metrics[id] = await serverService.metrics(id);
      } catch (error) {
        this.error = this.messageFor(error);
      }
    },

    async fetchPlayers(id: string): Promise<void> {
      try {
        this.players[id] = await serverService.players(id);
      } catch (error) {
        this.error = this.messageFor(error);
      }
    },

    applyMetricsEvent(id: string, snapshot: ServerMetricsDoc["snapshot"]): void {
      const existing = this.metrics[id];
      if (!existing) {
        this.metrics[id] = { running: true, pid: null, startedAt: null, snapshot, history: snapshot ? [snapshot] : [] };
        return;
      }
      existing.running = true;
      existing.snapshot = snapshot;
      if (snapshot) {
        existing.history = [...existing.history, snapshot].slice(-144);
      }
    },

    applyPlayerEvent(id: string, player: string, action: PlayerActivity["action"], timestamp: number, online: string[]): void {
      const existing = this.players[id];
      const activity: PlayerActivity = { player, action, timestamp };
      if (existing) {
        existing.online = online;
        existing.running = true;
        existing.activity = [...existing.activity, activity].slice(-100);
      } else {
        this.players[id] = { running: true, online, activity: [activity] };
      }
    },

    clearLiveState(id: string): void {
      this.metrics[id] = { running: false, pid: null, startedAt: null, snapshot: null, history: [] };
      this.players[id] = { running: false, online: [], activity: [] };
    },

    async start(id: string): Promise<string | null> {
      return this.lifecycle(id, (sid) => serverService.start(sid));
    },
    async stop(id: string): Promise<string | null> {
      return this.lifecycle(id, (sid) => serverService.stop(sid));
    },
    async restart(id: string): Promise<string | null> {
      return this.lifecycle(id, (sid) => serverService.restart(sid));
    },

    async lifecycle(id: string, op: (sid: string) => Promise<{ status: string }>): Promise<string | null> {
      try {
        const result = await op(id);
        const server = this.byId(id);
        if (server) server.status = (result.status || server.status) as ServerStatus;
        return result.status;
      } catch (error) {
        this.error = this.messageFor(error);
        return null;
      }
    },

    connectLive(): void {
      if (liveClient.isLive === true && this.connectedOnce) return;
      this.connectedOnce = true;
      liveClient.subscribe((event?: HubEvent) => {
        this.live = liveClient.isLive;
        if (!event) return;
        if (event.type === "server.status") {
          const server = this.byId(event.serverId);
          if (server) server.status = event.status as ServerStatus;
          if (event.status === "OFFLINE" || event.status === "CRASHED") {
            this.clearLiveState(event.serverId);
          }
        } else if (event.type === "server.console") {
          const lines = this.consoleLines[event.serverId] ?? [];
          lines.push({ line: event.line, timestamp: event.timestamp });
          this.consoleLines[event.serverId] = lines.slice(-MAX_CONSOLE_LINES);
        } else if (event.type === "server.consoleCleared") {
          this.consoleLines[event.serverId] = [];
        } else if (event.type === "server.metrics") {
          if (event.running) {
            this.applyMetricsEvent(event.serverId, event.snapshot);
          } else {
            this.clearLiveState(event.serverId);
          }
        } else if (event.type === "server.playerActivity") {
          this.applyPlayerEvent(event.serverId, event.player, event.action, event.timestamp, event.online);
        }
      });
      liveClient.connect();
    },

    disconnectLive(): void {
      liveClient.disconnect();
      this.live = false;
    },

    messageFor(error: unknown): string {
      if (error instanceof ApiClientError) return error.message;
      return error instanceof Error ? error.message : "Unexpected error";
    },

    asError(error: unknown): Error {
      return error instanceof ApiClientError
        ? error
        : new ApiClientError("UNKNOWN_ERROR", this.messageFor(error));
    },
  },
});