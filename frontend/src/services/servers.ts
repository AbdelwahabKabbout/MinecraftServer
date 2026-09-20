import { apiGet, apiPost, apiPut, apiDelete, type ApiClientError } from "./api";

export type ServerStatus = "OFFLINE" | "STARTING" | "ONLINE" | "STOPPING" | "CRASHED" | "UNKNOWN";

export interface ManagedServer {
  id: string;
  name: string;
  slug: string;
  minecraftVersion: string | null;
  loader: string;
  loaderVersion: string | null;
  javaPath: string;
  serverDirectory: string;
  memoryMinMb: number;
  memoryMaxMb: number;
  port: number;
  status: ServerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ServerCreatePayload {
  name: string;
  serverDirectory: string;
  minecraftVersion?: string;
  loader?: string;
  loaderVersion?: string;
  javaPath?: string;
  memoryMinMb?: number;
  memoryMaxMb?: number;
  port?: number;
}

export type ServerUpdatePayload = Partial<Omit<ServerCreatePayload, "name">> & { name?: string };

export interface ServerStatusResult {
  instance: ManagedServer;
  status: ServerStatus;
  running: boolean;
}

export interface DetectionReport {
  directory: string;
  exists: boolean;
  jars: string[];
  serverJar: string | null;
  hasServerProperties: boolean;
  serverPropertiesPath: string | null;
  eulaPresent: boolean;
  eulaAgreed: boolean;
  hasModsDir: boolean;
  hasConfigDir: boolean;
  hasWorldDir: boolean;
  hasLogsDir: boolean;
  hasCrashReportsDir: boolean;
  notes: string[];
  blockingMissing: string[];
}

export interface ConsoleLine {
  line: string;
  timestamp: number;
}

export const serverService = {
  list(): Promise<ManagedServer[]> {
    return apiGet<ManagedServer[]>("/servers");
  },
  get(id: string): Promise<ManagedServer> {
    return apiGet<ManagedServer>(`/servers/${id}`);
  },
  create(payload: ServerCreatePayload): Promise<ManagedServer> {
    return apiPost<ManagedServer>("/servers", payload);
  },
  update(id: string, payload: ServerUpdatePayload): Promise<ManagedServer> {
    return apiPut<ManagedServer>(`/servers/${id}`, payload);
  },
  remove(id: string): Promise<{ id: string; deleted: boolean }> {
    return apiDelete<{ id: string; deleted: boolean }>(`/servers/${id}`);
  },
  status(id: string): Promise<ServerStatusResult> {
    return apiGet<ServerStatusResult>(`/servers/${id}/status`);
  },
  detect(id: string): Promise<DetectionReport> {
    return apiGet<DetectionReport>(`/servers/${id}/detect`);
  },
  start(id: string): Promise<{ id: string; status: string }> {
    return apiPost<{ id: string; status: string }>(`/servers/${id}/start`);
  },
  stop(id: string): Promise<{ id: string; status: string }> {
    return apiPost<{ id: string; status: string }>(`/servers/${id}/stop`);
  },
  restart(id: string): Promise<{ id: string; status: string }> {
    return apiPost<{ id: string; status: string }>(`/servers/${id}/restart`);
  },
  command(id: string, command: string): Promise<{ id: string; sent: boolean }> {
    return apiPost<{ id: string; sent: boolean }>(`/servers/${id}/command`, { command });
  },
  consoleHistory(id: string, limit?: number): Promise<{ lines: ConsoleLine[] }> {
    const query = limit ? `?limit=${limit}` : "";
    return apiGet<{ lines: ConsoleLine[] }>(`/servers/${id}/console${query}`);
  },
  clearConsole(id: string): Promise<{ id: string; cleared: boolean; removed: number }> {
    return apiDelete<{ id: string; cleared: boolean; removed: number }>(`/servers/${id}/console`);
  },
};

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof Error && (error as Error).name === "ApiClientError";
}