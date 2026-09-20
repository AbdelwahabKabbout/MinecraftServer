import { db } from "../db/index.js";
import { servers, type NewServerRow, type ServerRow } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { ApiError } from "../utils/api.js";

function nowIso(): string {
  return new Date().toISOString();
}

export class ServerRepository {
  list(): ServerRow[] {
    return db.select().from(servers).all();
  }

  async get(id: string): Promise<ServerRow> {
    return this.getOrThrow(id);
  }

  getOrThrow(id: string): ServerRow {
    const row = db.select().from(servers).where(eq(servers.id, id)).get();
    if (!row) throw new ApiError("SERVER_NOT_FOUND", `Server ${id} was not found.`, 404);
    return row;
  }

  findBySlug(slug: string): ServerRow | undefined {
    return db.select().from(servers).where(eq(servers.slug, slug)).get();
  }

  async create(data: Omit<NewServerRow, "createdAt" | "updatedAt">): Promise<ServerRow> {
    const now = nowIso();
    const row: NewServerRow = { ...data, createdAt: now, updatedAt: now };
    db.insert(servers).values(row).run();
    return row as ServerRow;
  }

  async update(id: string, changes: Partial<NewServerRow>): Promise<ServerRow> {
    this.getOrThrow(id);
    db.update(servers)
      .set({ ...changes, updatedAt: nowIso() })
      .where(eq(servers.id, id))
      .run();
    return this.getOrThrow(id);
  }

  async patchStatus(id: string, status: string): Promise<void> {
    db.update(servers)
      .set({ status, updatedAt: nowIso() })
      .where(eq(servers.id, id))
      .run();
  }

  async delete(id: string): Promise<void> {
    this.getOrThrow(id);
    db.delete(servers).where(eq(servers.id, id)).run();
  }
}

export const serverRepository = new ServerRepository();