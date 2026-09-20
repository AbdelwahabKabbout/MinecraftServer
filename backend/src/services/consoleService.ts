import { consoleRepository, MAX_KEPT_ROWS_PER_SERVER } from "../repositories/consoleRepository.js";
import { logger } from "../config/logger.js";

const FLUSH_INTERVAL_MS = 100;

interface QueuedLine {
  line: string;
  timestamp: number;
}

/**
 * Buffers console output in memory and flushes it to SQLite in batches so a
 * chatty server does not hammer the database. History is bounded per server.
 */
export class ConsoleService {
  private readonly queues = new Map<string, QueuedLine[]>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly flushIntervalMs = FLUSH_INTERVAL_MS) {}

  handleLine(serverId: string, line: string, timestamp = Date.now()): void {
    const queue = this.queues.get(serverId) ?? [];
    queue.push({ line, timestamp });
    this.queues.set(serverId, queue);
    this.ensureFlusher();
  }

  history(serverId: string, limit?: number): Array<{ line: string; timestamp: number }> {
    return consoleRepository.read(serverId, { limit });
  }

  clear(serverId: string): { removed: number } {
    const removed = consoleRepository.count(serverId);
    consoleRepository.clear(serverId);
    this.queues.delete(serverId);
    return { removed };
  }

  flushNow(): void {
    for (const [serverId, queue] of this.queues) {
      if (queue.length === 0) continue;
      try {
        consoleRepository.insert(serverId, queue);
        this.queues.set(serverId, []);
        if (consoleRepository.count(serverId) > MAX_KEPT_ROWS_PER_SERVER) {
          consoleRepository.prune(serverId);
        }
      } catch (error) {
        logger.warn({ serverId, error }, "Failed to persist console lines");
      }
    }
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private ensureFlusher(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flushNow(), this.flushIntervalMs);
    this.timer.unref?.();
  }
}

export const consoleService = new ConsoleService();