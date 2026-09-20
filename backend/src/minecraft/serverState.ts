export const SERVER_STATUSES = [
  "OFFLINE",
  "STARTING",
  "ONLINE",
  "STOPPING",
  "CRASHED",
  "UNKNOWN",
] as const;

export type ServerStatus = (typeof SERVER_STATUSES)[number];

export function isServerStatus(value: string): value is ServerStatus {
  return (SERVER_STATUSES as readonly string[]).includes(value);
}

/**
 * Transition rules for the server lifecycle state machine.
 *
 *   OFFLINE  ──start──▶ STARTING ──online-detected──▶ ONLINE
 *      ▲                     │                            │
 *      │                    stop                          │ stop
 *   STOPPING ◀──────────────┴─────────────────────────────┤
 *      │            │                                     │
 *      └────exit────┘              (unexpected exit) ─────┘
 *                                        │
 *                                        ▼
 *                                     CRASHED ──start──▶ STARTING
 *
 * Unexpected exits out of STARTING or ONLINE go to CRASHED. Exits while
 * STOPPING (graceful shutdown) resolve to OFFLINE.
 */
const ALLOWED: Record<ServerStatus, readonly ServerStatus[]> = {
  OFFLINE: ["STARTING"],
  STARTING: ["ONLINE", "STOPPING", "CRASHED"],
  ONLINE: ["STOPPING", "CRASHED"],
  STOPPING: ["OFFLINE"],
  CRASHED: ["STARTING"],
  UNKNOWN: ["STARTING", "OFFLINE"],
};

export function transitionAllowed(from: ServerStatus, to: ServerStatus): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

export function assertTransition(from: ServerStatus, to: ServerStatus): void {
  if (!transitionAllowed(from, to)) {
    throw new Error(`Invalid server state transition: ${from} -> ${to}`);
  }
}

export const STATUS_LABEL: Record<ServerStatus, string> = {
  OFFLINE: "OFFLINE",
  STARTING: "STARTING",
  ONLINE: "ONLINE",
  STOPPING: "STOPPING",
  CRASHED: "CRASHED",
  UNKNOWN: "UNKNOWN",
};