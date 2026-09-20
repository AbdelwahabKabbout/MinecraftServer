import { and, desc, eq, lt, sql } from "drizzle-orm";
import { consoleLogs, type NewConsoleLogRow } from "../db/schema.js";
import { db } from "../db/index.js";

export interface ConsoleLine {
  line: string;
  timestamp: number;
}

export const MAX_KEPT_ROWS_PER_SERVER = 2000;

/**
 * Persists captured console output. History is bounded per server by pruning
 * rows past the cap.
 */
export const consoleRepository = {
  insert(serverId: string, lines: Array<{ line: string; timestamp: number }>): void {
    if (lines.length === 0) return;
    const rows: NewConsoleLogRow[] = lines.map(({ line, timestamp }) => ({
      serverId,
      line,
      createdAt: new Date(timestamp).toISOString(),
    }));
    db.insert(consoleLogs).values(rows).run();
  },

  /** Oldest-first slice of the most recent lines for `serverId`. */
  read(
    serverId: string,
    options: { limit?: number; beforeId?: number } = {},
  ): ConsoleLine[] {
    const limit = Math.min(options.limit ?? 200, MAX_KEPT_ROWS_PER_SERVER);
    const conditions = [eq(consoleLogs.serverId, serverId)];
    if (options.beforeId !== undefined) {
      conditions.push(lt(consoleLogs.id, options.beforeId));
    }
    const rows = db
      .select({ id: consoleLogs.id, line: consoleLogs.line, createdAt: consoleLogs.createdAt })
      .from(consoleLogs)
      .where(and(...conditions))
      .orderBy(desc(consoleLogs.id))
      .limit(limit)
      .all();
    return rows
      .reverse()
      .map((row) => ({ line: row.line, timestamp: new Date(row.createdAt).getTime() }));
  },

  count(serverId: string): number {
    const row = db
      .select({ n: sql<number>`count(*)` })
      .from(consoleLogs)
      .where(eq(consoleLogs.serverId, serverId))
      .get();
    return row?.n ?? 0;
  },

  /** Deletes old rows until `keep` newest remain for `serverId`. Returns count removed. */
  prune(serverId: string, keep = MAX_KEPT_ROWS_PER_SERVER): number {
    const cutoff = db
      .select({ id: consoleLogs.id })
      .from(consoleLogs)
      .where(eq(consoleLogs.serverId, serverId))
      .orderBy(desc(consoleLogs.id))
      .limit(1)
      .offset(keep - 1)
      .all();
    if (cutoff.length === 0) return 0;
    const cutoffId = cutoff[0]!.id;
    const { changes } = db
      .delete(consoleLogs)
      .where(and(eq(consoleLogs.serverId, serverId), lt(consoleLogs.id, cutoffId)))
      .run();
    return changes;
  },

  clear(serverId: string): void {
    db.delete(consoleLogs).where(eq(consoleLogs.serverId, serverId)).run();
  },
};