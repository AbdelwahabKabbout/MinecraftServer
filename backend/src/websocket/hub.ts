import type { WebSocket } from "ws";
import { logger } from "../config/logger.js";

export interface ServerStatusEvent {
  type: "server.status";
  serverId: string;
  status: string;
}

export interface ServerConsoleEvent {
  type: "server.console";
  serverId: string;
  line: string;
  timestamp: number;
}

export type HubEvent = ServerStatusEvent | ServerConsoleEvent;

/**
 * Central WebSocket hub. Server connections register/unregister and typed
 * events are broadcast to every connected dashboard client.
 */
class WsHub {
  private connections = new Set<WebSocket>();
  private startedAt = Date.now();

  add(socket: WebSocket): void {
    this.connections.add(socket);
    socket.send(JSON.stringify({ type: "hub.hello", uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000) }));
  }

  remove(socket: WebSocket): void {
    this.connections.delete(socket);
  }

  get clientCount(): number {
    return this.connections.size;
  }

  broadcast(event: HubEvent): void {
    const payload = JSON.stringify(event);
    for (const socket of this.connections) {
      if (socket.readyState === socket.OPEN) {
        try {
          socket.send(payload);
        } catch (error) {
          logger.warn({ error }, "Failed to send WebSocket message");
          this.connections.delete(socket);
        }
      }
    }
  }
}

export const wsHub = new WsHub();