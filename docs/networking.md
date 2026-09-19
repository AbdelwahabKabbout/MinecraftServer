# Networking

## LAN-first

The MVP targets **local / LAN** operation only. A running server instance exposes:

```text
host        → the local network address
port        → the configured server-port
```

The dashboard shows a joinable address, e.g.:

```text
Local address:
192.168.x.x:25565
```

The host IP is **detected at runtime** from the machine's network interfaces — never hard-coded.

## NetworkProvider abstraction

Global/Internet reachability is a future concern (port forwarding, tunneling). Instead of baking a tunnel into the MVP, networking is behind an interface:

```text
NetworkProvider
├── LocalNetworkProvider        (MVP — implemented)
├── PortForwardNetworkProvider  (future)
└── TunnelNetworkProvider       (future)
```

The interface exposes capabilities and resolved connection info, for example:

```ts
interface NetworkProvider {
  readonly kind: "local" | "port-forward" | "tunnel";
  getAddress(instance): Promise<Placement>;
}
```

Providers are swappable per server instance. The frontend consumes the resolved address and never assumes the mechanism.

## Explicit non-goals (for now)

- No custom global tunnel/dDNS service.
- No public hosting platform.
- The manager API binds locally by default (`127.0.0.1` if you prefer strict privacy; the default `0.0.0.0` exposes the manager on the LAN). This is a management dashboard — do **not** expose it to the public internet without authentication, which is a later milestone.