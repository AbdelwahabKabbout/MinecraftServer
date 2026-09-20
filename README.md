# Minecraft Server Manager

A local-first web application for creating, controlling, monitoring and configuring Minecraft **Java Edition** server instances, with an architecture ready for modpack management and client-side modpack distribution.

> **Status: Server management (Phase 2).** Instances can be registered against directories in `servers/`, detected (jar, EULA, structure), started/stopped/restarted through a safe Java process manager, and observed live over WebSocket. Live console UI, configuration editing, metrics, modpacks and networking are implemented in subsequent milestones.

---

## Why local-first?

The manager is **not** "a Vue frontend calling a generic API". The backend is a real Minecraft management core:

```text
                Web Dashboard
                     │
                     │ HTTP / WebSocket
                     ▼
            Minecraft Manager API
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
    Database      File System   Process Manager
        │            │            │
        │            │            ▼
        │            │       Java Process
        │            │            │
        │            │            ▼
        │            │    Minecraft Server
        │            │            │
        │            └── mods/ config/ world/
        │               server.properties logs/
        │
        └── metadata/configuration
```

The Minecraft runtime files live on disk under `servers/`; the database stores metadata only.

## Requirements

- **Node.js ≥ 20** (tested on Node 24) and npm
- **Java 17+** (Java 21 recommended) available on the machine that hosts the servers; the path is configurable per server instance
- No other services are required (SQLite runs in-process)

## Installation

```bash
git clone https://github.com/AbdelwahabKabbout/MinecraftServer.git
cd MinecraftServer
npm install
```

Configure the environment:

```bash
Copy-Item .env.example .env     # PowerShell
# or:  cp .env.example .env      # macOS/Linux
```

Adjust `HTTP_PORT`, `DATABASE_URL`, `SERVER_ROOT`, `JAVA_PATH`, memory defaults and `SHUTDOWN_TIMEOUT_MS` as needed. Never commit `.env`.

## Development commands

| Command                     | What it does                              |
| --------------------------- | ----------------------------------------- |
| `npm run dev:backend`       | Start the backend (tsx watch) on `:3000`  |
| `npm run dev:frontend`      | Start the frontend (Vite) on `:5173`      |
| `npm run build`             | Type-check + build backend and frontend   |
| `npm run test`              | Run backend tests (Vitest)                |
| `npm run typecheck`         | Type-check both workspaces                |
| `npm run db:generate`       | Generate a Drizzle migration              |
| `npm run db:migrate`        | Apply pending migrations manually         |

The Vite dev server proxies `/api` and `/ws` to the backend, so the frontend talks to a single origin.

## Verify the foundation

1. Start the backend: `npm run dev:backend`
2. Start the frontend: `npm run dev:frontend`  → open http://localhost:5173
3. Health check: `GET http://127.0.0.1:3000/api/health`

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "0.1.0",
    "uptimeSeconds": 42,
    "database": { "sqlite": "3.53.4" },
    "environment": "development"
  }
}
```

## Project structure

```text
MinecraftServer/
├── backend/
│   ├── src/
│   │   ├── config/        env parsing (zod), logger
│   │   ├── db/            SQLite (better-sqlite3) + Drizzle, migrations
│   │   ├── minecraft/     detection, server.properties, process manager, state machine
│   │   ├── repositories/  thin data-access layer over Drizzle
│   │   ├── routes/        Fastify routes + error handler
│   │   ├── services/      domain services tying repositories/process/files together
│   │   ├── utils/         API envelope, path safety, slugify, version
│   │   ├── websocket/     broadcast hub for typed events
│   │   ├── server.ts      Fastify app factory (routes + /ws)
│   │   └── index.ts       entry point
│   ├── drizzle/           generated SQL migrations
│   └── package.json
├── frontend/
│   └── src/
│       ├── components/    reusable UI (StatusPill, dialogs, form modal)
│       ├── views/         pages (dashboard, servers, modpacks, settings)
│       ├── layouts/       app shell (sidebar)
│       ├── stores/        Pinia state (system, servers)
│       ├── services/      API client (axios + WebSocket)
│       ├── router/
│       └── main.ts
├── servers/               Minecraft server instances live here (gitignored)
├── docs/                  architecture and feature documentation
├── .env.example
└── README.md
```

## Configuring a Minecraft server

The manager registers and controls existing server installations. See [docs/minecraft-server-setup.md](docs/minecraft-server-setup.md).

## Managing servers

### Registering a server

On the **Servers** page, click **+ New server** and point it at a directory inside `servers/` (relative path). The manager never touches files at registration time — it only stores metadata. The recommended layout is one subdirectory per instance:

```text
servers/
└── survival/                 ← this is the serverDirectory
    ├── fabric-server-mc.1.21.4-launcher.jar
    ├── server.jar
    ├── eula.txt              ← must contain eula=true to launch
    ├── server.properties
    ├── mods/  config/  world/  logs/
```

Per-instance settings: `minecraftVersion`, loader (`fabric`) + loader version, Java executable path, JVM heap (min/max MB) and port.

### Detection

The **Server files** section of an instance runs a read-only check: preferred launcher jar, `server.properties` presence, `eula.txt` acceptance, and the presence of `mods/`, `config/`, `world/`, `logs/` and `crash-reports/`. Blocking issues (`server.jar` missing, EULA not accepted) are surfaced before any launch is attempted.

### Lifecycle

- **Start** spawns `java` with `-Xms`/`-Xmx`, `-jar <detected jar> nogui`, in the server directory. State transitions `OFFLINE → STARTING → ONLINE`, where `ONLINE` is only marked when the server prints `Done (...)`. Dropped process → `CRASHED`.
- **Stop** sends `stop` to stdin and waits `SHUTDOWN_TIMEOUT_MS` (default 15s) before force-killing.
- **Restart** stops then starts again.
- All state changes (and console lines) are broadcast live on the `/ws` hub as `server.status` / `server.console` events.

### API surface

| Method | Endpoint | Purpose |
| ------ | -------- | ------- |
| GET | `/api/servers` | List instances |
| POST | `/api/servers` | Register an instance |
| GET/PUT/DELETE | `/api/servers/:id` | Read, update, delete (delete blocked while running) |
| GET | `/api/servers/:id/status` | Live status + running flag |
| GET | `/api/servers/:id/detect` | Filesystem readiness report |
| POST | `/api/servers/:id/start` | Launch the server |
| POST | `/api/servers/:id/stop` | Graceful stop |
| POST | `/api/servers/:id/restart` | Restart |
| POST | `/api/servers/:id/command` | Send a server command via stdin |
| GET | `/api/servers/:id/console` | Buffered console lines |

## Documentation

- [docs/architecture.md](docs/architecture.md) — backend architecture and component responsibilities
- [docs/minecraft-server-setup.md](docs/minecraft-server-setup.md) — how to install and register a Fabric Minecraft server
- [docs/modpack-system.md](docs/modpack-system.md) — modpack manifest format, validation and distribution plan
- [docs/networking.md](docs/networking.md) — LAN-first networking and the `NetworkProvider` abstraction

## Known limitations (Phase 2)

- Live console UI and command input arrive with the console milestone (the backend already streams `server.console` events and exposes `/console`)
- `server.properties` editing UI is not built yet (the parser/writer exists and round-trips unknown keys)
- Metrics (CPU/RAM, player join/leave) arrive with the monitoring milestone
- Modpack definitions and validation are **not yet implemented**
- No authentication: the manager binds locally / on your LAN by default. Do not expose it directly to the public internet.

## Roadmap

1. ✅ **Server management** — instance CRUD, directory detection, process manager (start/stop/restart, safe spawning)
2. **Console** — live console UI (stdout/stderr streams already flow over WebSocket), command input
3. **Configuration** — `server.properties` editing UI on top of the parser/writer
4. **Monitoring** — CPU/RAM metrics, player join/leave detection, live WebSocket updates
5. **Modpacks** — manifests, import/export, checksum validation
6. **Networking** — LAN connection info, `NetworkProvider` abstraction
7. **Client distribution** — a companion launcher that reads manifests, verifies `sha256` and launches Minecraft

See [docs/modpack-system.md](docs/modpack-system.md) and [docs/networking.md](docs/networking.md) for the forward-looking plans.