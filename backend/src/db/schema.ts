import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Database schema.
 *
 * `appMeta` stores small application key/value metadata.
 *
 * `servers` stores metadata for Minecraft server instances. Runtime files
 * (worlds, jars, server.properties, mods) live on disk; only configuration
 * that the manager owns lives here.
 *
 * `consoleLogs` persists the captured console output per server so the history
 * survives process restarts and reloads.
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

export const consoleLogs = sqliteTable(
  "console_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    serverId: text("server_id").notNull(),
    line: text("line").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("console_logs_server_id_idx").on(table.serverId, table.id)],
);

export type ConsoleLogRow = typeof consoleLogs.$inferSelect;
export type NewConsoleLogRow = typeof consoleLogs.$inferInsert;

/**
 * `modpacks` stores modpack metadata; the manifest JSON is the source of truth
 * and lives verbatim in `manifest`. Mod files themselves stay on disk inside a
 * server's `mods/` directory — this table references no files.
 */
export const modpacks = sqliteTable("modpacks", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  minecraftVersion: text("minecraft_version").notNull(),
  loader: text("loader").notNull().default("fabric"),
  loaderVersion: text("loader_version"),
  manifest: text("manifest").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type ModpackRow = typeof modpacks.$inferSelect;
export type NewModpackRow = typeof modpacks.$inferInsert;