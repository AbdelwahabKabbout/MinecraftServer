import { apiGet } from "./api";

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  uptimeSeconds: number;
  database: { sqlite: string } | null;
  environment: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return apiGet<HealthResponse>("/health");
}