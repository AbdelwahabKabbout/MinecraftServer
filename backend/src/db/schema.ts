import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Database schema.
 *
 * `appMeta` stores small application key/value metadata.
 *
 * `servers` stores metadata for Minecraft server instances. Runtime files
 * (worlds, jars, server.properties, mods) live on disk; only configuration
 * that the manager owns lives here.
 */

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const servers = sqliteTable("servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  minecraftVersion: text("minecraft_version"),
  loader: text("loader").notNull().default("fabric"),
  loaderVersion: text("loader_version"),
  javaPath: text("java_path").notNull(),
  serverDirectory: text("server_directory").notNull(),
  memoryMinMb: integer("memory_min_mb").notNull(),
  memoryMaxMb: integer("memory_max_mb").notNull(),
  port: integer("port").notNull().default(25565),
  status: text("status").notNull().default("OFFLINE"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type ServerRow = typeof servers.$inferSelect;
export type NewServerRow = typeof servers.$inferInsert;