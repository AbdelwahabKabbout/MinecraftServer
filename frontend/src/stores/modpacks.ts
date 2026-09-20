import { defineStore } from "pinia";
import {
  modpackService,
  type ModpackRecord,
  type ModpackManifest,
  type ValidationReport,
} from "@/services/modpacks";
import { ApiClientError } from "@/services/api";

interface ModpacksState {
  items: ModpackRecord[];
  loading: boolean;
  error: string | null;
  validating: boolean;
  reports: Record<string, ValidationReport>;
}

export const useModpacksStore = defineStore("modpacks", {
  state: (): ModpacksState => ({
    items: [],
    loading: false,
    error: null,
    validating: false,
    reports: {},
  }),

  actions: {
    async fetchList(): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        this.items = await modpackService.list();
      } catch (error) {
        this.error = this.messageFor(error);
      } finally {
        this.loading = false;
      }
    },

    async create(manifest: ModpackManifest): Promise<ModpackRecord | null> {
      try {
        const record = await modpackService.create(manifest);
        this.items.push(record);
        return record;
      } catch (error) {
        throw this.asError(error);
      }
    },

    async importText(text: string): Promise<ModpackRecord | null> {
      try {
        const record = await modpackService.importText(text);
        this.items.push(record);
        return record;
      } catch (error) {
        throw this.asError(error);
      }
    },

    async update(id: string, manifest: ModpackManifest): Promise<ModpackRecord | null> {
      try {
        const record = await modpackService.update(id, manifest);
        const index = this.items.findIndex((m) => m.id === id);
        if (index !== -1) this.items[index] = record;
        return record;
      } catch (error) {
        throw this.asError(error);
      }
    },

    async remove(id: string): Promise<void> {
      try {
        await modpackService.remove(id);
        this.items = this.items.filter((m) => m.id !== id);
        delete this.reports[id];
      } catch (error) {
        throw this.asError(error);
      }
    },

    async validate(id: string, serverId: string): Promise<ValidationReport | null> {
      this.validating = true;
      try {
        const report = await modpackService.validate(id, serverId);
        this.reports[id] = report;
        return report;
      } catch (error) {
        this.error = this.messageFor(error);
        return null;
      } finally {
        this.validating = false;
      }
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