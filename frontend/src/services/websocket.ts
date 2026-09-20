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

export interface ServerConsoleClearedEvent {
  type: "server.consoleCleared";
  serverId: string;
}

export interface ServerMetricsEvent {
  type: "server.metrics";
  serverId: string;
  running: boolean;
  pid: number | null;
  startedAt: number | null;
  snapshot: { timestamp: number; cpuPercent: number | null; memoryMb: number } | null;
}

export interface ServerPlayerActivityEvent {
  type: "server.playerActivity";
  serverId: string;
  player: string;
  action: "joined" | "left";
  timestamp: number;
  online: string[];
}

export interface HubHelloEvent {
  type: "hub.hello";
  uptimeSeconds: number;
}

export type HubEvent =
  | ServerStatusEvent
  | ServerConsoleEvent
  | ServerConsoleClearedEvent
  | ServerMetricsEvent
  | ServerPlayerActivityEvent
  | HubHelloEvent;

type Handler = (event?: HubEvent) => void;

/**
 * Minimal resilient WebSocket client for the manager hub at /ws.
 * Reconnects automatically with a capped backoff and drops events while the
 * socket is reconnecting (consumers re-sync via the REST API).
 */
export class WsClient {
  private socket: WebSocket | null = null;
  private readonly url: string;
  private disconnected = true;
  private retryDelay = 500;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers = new Set<Handler>();
  private live = false;

  constructor(url = "/ws") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.url = `${proto}//${window.location.host}${url}`;
  }

  get isLive(): boolean {
    return this.live;
  }

  connect(): void {
    if (this.socket) return;
    this.disconnected = false;
    try {
      this.socket = new WebSocket(this.url);
    } catch (error) {
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.live = true;
      this.retryDelay = 500;
      this.notify();
    };
    this.socket.onmessage = (raw) => {
      try {
        const event = JSON.parse(raw.data as string) as HubEvent;
        this.notify(event);
      } catch {
        // Ignore malformed frames.
      }
    };
    this.socket.onerror = () => {
      // onclose always follows; nothing to do here.
    };
    this.socket.onclose = () => {
      this.live = false;
      this.socket = null;
      this.notify();
      if (!this.disconnected) this.scheduleReconnect();
    };
  }

  disconnect(): void {
    this.disconnected = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.live = false;
  }

  /** Subscribes to hub events (including connection state transitions). */
  subscribe(listener: (event?: HubEvent) => void): () => void {
    this.handlers.add(listener);
    return () => this.handlers.delete(listener);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.disconnected) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 10_000);
  }

  private notify(event?: HubEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // A misbehaving handler must not break the hub.
      }
    }
  }
}