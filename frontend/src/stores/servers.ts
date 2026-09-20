import { defineStore } from "pinia";
import {
  serverService,
  type ManagedServer,
  type ServerCreatePayload,
  type ServerUpdatePayload,
  type DetectionReport,
  type ServerStatus,
} from "@/services/servers";
import { WsClient, type HubEvent } from "@/services/websocket";
import { ApiClientError } from "@/services/api";

const liveClient = new WsClient();

interface ServerViewState {
  servers: ManagedServer[];
  loading: boolean;
  error: string | null;
  detections: Record<string, DetectionReport>;
  consoleLines: Record<string, string[]>;
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
    live: false,
    connectedOnce: false,
  }),

  getters: {
    byId: (state) => (id: string): ManagedServer | undefined =>
      state.servers.find((s) => s.id === id),
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
        } else if (event.type === "server.console") {
          const lines = this.consoleLines[event.serverId] ?? [];
          lines.push(`${new Date(event.timestamp).toLocaleTimeString()}  ${event.line}`);
          this.consoleLines[event.serverId] = lines.slice(-1000);
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