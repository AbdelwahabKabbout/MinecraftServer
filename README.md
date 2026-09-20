# Minecraft Server Manager

A local-first web application for creating, controlling, monitoring and configuring Minecraft **Java Edition** server instances, with an architecture ready for modpack management and client-side modpack distribution.

> **Status: Configuration milestone (Phase 4).** Instances can be registered against directories in `servers/`, detected (jar, EULA, structure), started/stopped/restarted through a safe Java process manager, observed live (persistent console + command input), and configured through a `server.properties` editor that preserves comments, ordering and unknown keys. Metrics, modpacks and networking are implemented in subsequent milestones.

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
- All state changes (and console lines) are broadcast live on the `/ws` hub as `server.status` / `server.console` / `server.consoleCleared` events.

### Console

Every instance has a persistent console log (captured stdout/stderr plus `[manager]`-prefixed annotations). Lines are persisted to SQLite in batches and pruned to the newest 2000 per server, so history survives restarts and page reloads.

The **Console** panel on the server detail page shows the timestamped log with:
- live streaming over WebSocket with an auto-scroll that pauses when you scroll up (with a "Jump to bottom" shortcut),
- a command input with ⭡/⭣ history recall (commands work while the server is running),
- highlighting for `[manager]` markers and `ERROR`/`WARN` lines,
- a labelled **Clear** action (with confirm) that wipes both the stored history and the running buffer.

### Server properties

The **Server properties** panel edits the instance's `server.properties` file without clobbering anything else:

- **Common** tab: a form for the settings you touch most often (MOTD, port, difficulty, gamemode, player limits, whitelist/online-mode/pvp and other toggles, RCON...).
- **Raw** tab: the full document, comments included. Lines are validated on save (`key=value` format, lowercase dotted/hyphenated keys); problems come back with a line-level report.
- Structured saves are single-key patches — comments, ordering and keys the form does not model are preserved exactly. Empty fields are removed so Minecraft's built-in defaults apply; a `null` value deletes a key.
- Unknown/forward-looking keys are safe: they round-trip unchanged.
- Missing file → the editor offers to create one on save.

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
| GET | `/api/servers/:id/console` | Stored console history (`?limit=n`, oldest-first) |
| DELETE | `/api/servers/:id/console` | Clear stored console history (+ running buffer) |
| GET | `/api/servers/:id/properties` | Read `server.properties` (path, raw text, pairs) |
| PUT | `/api/servers/:id/properties` | Patch values (`{values}`) or write raw text (`{raw}`) |

## Documentation

- [docs/architecture.md](docs/architecture.md) — backend architecture and component responsibilities
- [docs/minecraft-server-setup.md](docs/minecraft-server-setup.md) — how to install and register a Fabric Minecraft server
- [docs/modpack-system.md](docs/modpack-system.md) — modpack manifest format, validation and distribution plan
- [docs/networking.md](docs/networking.md) — LAN-first networking and the `NetworkProvider` abstraction

## Known limitations (Phase 4)

- Metrics (CPU/RAM, player join/leave) arrive with the monitoring milestone
- Modpack definitions and validation are **not yet implemented**
- No authentication: the manager binds locally / on your LAN by default. Do not expose it directly to the public internet.

## Roadmap

1. ✅ **Server management** — instance CRUD, directory detection, process manager (start/stop/restart, safe spawning)
2. ✅ **Console** — persistent console log, live WebSocket streaming, autoscroll, highlighting, command input with history
3. ✅ **Configuration** — `server.properties` editor (structured form + raw mode) on top of the round-tripping parser
4. **Monitoring** — CPU/RAM metrics, player join/leave detection, live WebSocket updates
5. **Modpacks** — manifests, import/export, checksum validation
6. **Networking** — LAN connection info, `NetworkProvider` abstraction
7. **Client distribution** — a companion launcher that reads manifests, verifies `sha256` and launches Minecraft

See [docs/modpack-system.md](docs/modpack-system.md) and [docs/networking.md](docs/networking.md) for the forward-looking plans.