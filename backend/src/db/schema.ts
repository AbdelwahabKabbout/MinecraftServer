import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Database schema for Phase 1 (foundation).
 *
 * `appMeta` stores small application key/value metadata (e.g. applied
 * migration bookkeeping is handled by the drizzle migrator itself).
 *
 * Tables for Server, Modpack, Mod and ServerModpack are introduced by later
 * phases. The schema is kept deliberately small so it does not create tables
 * for information that naturally belongs in Minecraft files
 * (server.properties, mod files on disk, worlds, etc).
 */

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});