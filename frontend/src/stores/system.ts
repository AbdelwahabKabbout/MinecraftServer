import { defineStore } from "pinia";
import { apiGet } from "@/services/api";

export interface ServerInstanceSummary {
  id: string;
  name: string;
  slug: string;
  minecraftVersion: string | null;
  loader: string | null;
  loaderVersion: string | null;
  javaPath: string;
  serverDirectory: string;
  memoryMinMb: number;
  memoryMaxMb: number;
  port: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export const useSystemStore = defineStore("system", {
  state: () => ({
    backendHealthy: false,
    backendVersion: null as string | null,
    sqliteVersion: null as string | null,
    backendError: null as string | null,
    lastCheckedAt: null as number | null,
    statusPollTimer: null as ReturnType<typeof setInterval> | null,
  }),
  actions: {
    async checkHealth(): Promise<boolean> {
      try {
        const health = await apiGet<{
          status: string;
          version: string;
          database: { sqlite: string } | null;
        }>("/health");
        this.backendHealthy = health.status === "ok";
        this.backendVersion = health.version;
        this.sqliteVersion = health.database?.sqlite ?? null;
        this.backendError = null;
      } catch (error) {
        this.backendHealthy = false;
        this.backendError = error instanceof Error ? error.message : "Backend unreachable";
      }
      this.lastCheckedAt = Date.now();
      return this.backendHealthy;
    },
    startStatusPolling(intervalMs = 10_000): void {
      this.stopStatusPolling();
      this.statusPollTimer = setInterval(() => void this.checkHealth(), intervalMs);
    },
    stopStatusPolling(): void {
      if (this.statusPollTimer) {
        clearInterval(this.statusPollTimer);
        this.statusPollTimer = null;
      }
    },
  },
});

export async function listServers(): Promise<ServerInstanceSummary[]> {
  return apiGet<ServerInstanceSummary[]>("/servers");
}