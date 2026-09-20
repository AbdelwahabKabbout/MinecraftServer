import { db } from "../db/index.js";
import { modpacks, type NewModpackRow, type ModpackRow } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { ApiError } from "../utils/api.js";
import type { ModpackManifest } from "../modpacks/manifest.js";

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

function nowIso(): string {
  return new Date().toISOString();
}

function toRecord(row: ModpackRow): ModpackRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    version: row.version,
    minecraftVersion: row.minecraftVersion,
    loader: row.loader,
    loaderVersion: row.loaderVersion,
    manifest: JSON.parse(row.manifest) as ModpackManifest,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ModpackRepository {
  list(): ModpackRecord[] {
    return db.select().from(modpacks).all().map(toRecord);
  }

  getOrThrow(id: string): ModpackRecord {
    const row = db.select().from(modpacks).where(eq(modpacks.id, id)).get();
    if (!row) throw new ApiError("MODPACK_NOT_FOUND", `Modpack ${id} was not found.`, 404);
    return toRecord(row);
  }

  findBySlug(slug: string): ModpackRecord | undefined {
    const row = db.select().from(modpacks).where(eq(modpacks.slug, slug)).get();
    return row ? toRecord(row) : undefined;
  }

  async create(data: Omit<NewModpackRow, "createdAt" | "updatedAt">): Promise<ModpackRecord> {
    const now = nowIso();
    const row: NewModpackRow = {
      ...data,
      loader: data.loader ?? "fabric",
      loaderVersion: data.loaderVersion ?? null,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(modpacks).values(row).run();
    return toRecord(row as ModpackRow);
  }

  async update(id: string, changes: Partial<NewModpackRow>): Promise<ModpackRecord> {
    this.getOrThrow(id);
    db.update(modpacks)
      .set({
        ...changes,
        loader: changes.loader ?? "fabric",
        loaderVersion: changes.loaderVersion ?? null,
        updatedAt: nowIso(),
      })
      .where(eq(modpacks.id, id))
      .run();
    return this.getOrThrow(id);
  }

  async delete(id: string): Promise<void> {
    this.getOrThrow(id);
    db.delete(modpacks).where(eq(modpacks.id, id)).run();
  }
}

export const modpackRepository = new ModpackRepository();