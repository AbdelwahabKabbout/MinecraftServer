import { apiGet, apiPost, apiPut, apiDelete } from "./api";

export interface ModEntry {
  id: string;
  name: string;
  version: string;
  filename: string;
  downloadUrl?: string;
  sha256?: string;
  required: boolean;
}

export interface ModpackManifest {
  name: string;
  version: string;
  minecraftVersion: string;
  loader: "fabric";
  loaderVersion?: string;
  mods: ModEntry[];
}

export interface ModpackRecord {
  id: string;
  slug: string;
  name: string;
  version: string;
  minecraftVersion: string;
  loader: string;
  loaderVersion: string | null;
  manifest: ModpackManifest;
  createdAt: string;
  updatedAt: string;
}

export type ValidationLevel = "ok" | "missing" | "version-mismatch" | "checksum-mismatch" | "unexpected";

export interface ValidationIssue {
  level: ValidationLevel;
  modId?: string;
  filename?: string;
  expected?: string;
  found?: string;
  message: string;
}

export interface ValidationReport {
  serverId: string;
  summary: { total: number; ok: number; missing: number; versionMismatch: number; checksumMismatch: number; unexpected: number };
  issues: ValidationIssue[];
}

export const modpackService = {
  list(): Promise<ModpackRecord[]> {
    return apiGet<ModpackRecord[]>("/modpacks");
  },
  get(id: string): Promise<ModpackRecord> {
    return apiGet<ModpackRecord>(`/modpacks/${id}`);
  },
  create(manifest: ModpackManifest): Promise<ModpackRecord> {
    return apiPost<ModpackRecord>("/modpacks", manifest);
  },
  importText(text: string): Promise<ModpackRecord> {
    return apiPost<ModpackRecord>("/modpacks/import", { text });
  },
  update(id: string, manifest: ModpackManifest): Promise<ModpackRecord> {
    return apiPut<ModpackRecord>(`/modpacks/${id}`, manifest);
  },
  remove(id: string): Promise<{ id: string; deleted: boolean }> {
    return apiDelete<{ id: string; deleted: boolean }>(`/modpacks/${id}`);
  },
  manifest(record: ModpackRecord): string {
    return JSON.stringify(record.manifest, null, 2);
  },
  validate(id: string, serverId: string): Promise<ValidationReport> {
    return apiGet<ValidationReport>(`/modpacks/${id}/validate?serverId=${encodeURIComponent(serverId)}`);
  },
  download(record: ModpackRecord): void {
    const blob = new Blob([JSON.stringify(record.manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${record.slug}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  },
};