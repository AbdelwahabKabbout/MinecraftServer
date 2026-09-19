import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { paths } from "../config/index.js";

const isMemory = paths.database === ":memory:";
if (!isMemory) {
  fs.mkdirSync(path.dirname(paths.database), { recursive: true });
}

const sqlite = new Database(paths.database);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite);
export { sqlite };

export function databaseVersion(): string {
  const row = sqlite.prepare("SELECT sqlite_version() AS v").get() as { v: string };
  return row.v;
}

export function readAppMeta(key: string): string | undefined {
  const row = sqlite.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function writeAppMeta(key: string, value: string): void {
  sqlite
    .prepare("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}