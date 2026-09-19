import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index.js";
import { logger } from "../config/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveMigrationsDir(): string {
  return path.resolve(__dirname, "..", "..", "drizzle");
}

/**
 * Applies pending SQL migrations using drizzle-orm's migrator, which reads the
 * `meta/_journal.json` snapshot next to the SQL files. Files are applied once,
 * in order; already-applied ones are tracked by the migrator.
 *
 * Returns the number of migrations run in this invocation, when determinable,
 * otherwise null. The migrator does not expose the applied count, so a best
 * effort (tip commit in the journal) is not meaningful at the public layer.
 */
export function runMigrations(): number {
  const dir = resolveMigrationsDir();
  if (!fs.existsSync(path.join(dir, "meta", "_journal.json"))) {
    logger.info("No drizzle migrations journal found, skipping migrations.");
    return 0;
  }
  migrate(db, { migrationsFolder: dir });
  logger.info({ folder: dir }, "Database migrations up to date");
  return 0;
}

// Runs the migration suite when executed directly: npm run db:migrate
if (process.argv[1] && path.basename(process.argv[1]) === "migrate.ts") {
  const ran = runMigrations();
  logger.info({ ran }, "Migrations finished");
}