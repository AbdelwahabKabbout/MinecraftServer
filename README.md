# Minecraft Server Manager

A local-first web application for creating, controlling, monitoring and configuring Minecraft **Java Edition** server instances, with an architecture ready for modpack management and client-side modpack distribution.

> **Status: Client distribution milestone (Phase 8) — all planned milestones complete.** The manager registers server instances against directories in `servers/`, detects them (jar, EULA, structure), starts/stops/restarts them through a safe Java process manager, observes them live (persistent console + command input), configures them (a `server.properties` editor that preserves comments, ordering and unknown keys), monitors them live (CPU/RAM every 5 s, uptime/PID, online players over WebSocket), tracks modpacks as immutable manifests (import/export/validate against `mods/`), reports LAN connection addresses, and ships a standalone `launcher/` CLI that applies a manifest to any mods directory and runs the server.

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
| `npm run test`              | Run all workspace tests (Vitest)          |
| `npm run typecheck`         | Type-check all workspaces                 |
| `npm run db:generate`       | Generate a Drizzle migration              |
| `npm run db:migrate`        | Apply pending migrations manually         |
| `npm run launcher:sync`     | Run the launcher CLI from the repo root   |

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
│   │   ├── modpacks/      manifest schema + parsing
│   │   ├── monitoring/    metrics sampling (CPU/RAM), player tracking
│   │   ├── networking/    swappable network providers (LAN resolution)
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
│       ├── components/    reusable UI (StatusPill, dialogs, form modal, panels)
│       ├── views/         pages (dashboard, servers, modpacks, settings)
│       ├── layouts/       app shell (sidebar)
│       ├── stores/        Pinia state (system, servers, modpacks)
│       ├── services/      API client (axios + WebSocket)
│       ├── router/
│       └── main.ts
├── launcher/              standalone CLI: validate/sync/launch a modpack (see below)
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

### Monitoring

While a server is running, the manager samples the Java process every 5 seconds and streams it to the dashboard:

- **CPU %** and **resident RAM** (working-set / RSS, platform-native readers: Linux `/proc/<pid>` and Windows `Get-Process`). The first sample shows RAM only; CPU% appears from the second sample (elapsed-time based). History (last ~12 minutes) is held per server and exposed over REST.
- **Uptime and PID** of the live process.
- **Online players**: join/leave is detected by parsing console output (`X joined the game` / `X left the game`). The player list and a timestamped activity feed update live; the current list is also served over REST.
- Live values arrive over `/ws` as `server.metrics` and `server.playerActivity` events; they stop/reset when the server stops.

### Modpacks

A modpack is an **immutable, exportable manifest** (JSON) describing the mod environment a server — or, later, a client launcher — should have. Details: [docs/modpack-system.md](docs/modpack-system.md).

- The **Modpacks** page lists packs, imports a JSON file, and offers a manifest editor for creating/editing them (names, versions, MC version, Fabric loader, and up to 500 mod entries).
- Each mod entry declares an id, name, version, a plain `*.jar` filename, an optional `downloadUrl` and an optional `sha256`. Filenames must be plain jar names (no paths); ids must be unique and lowercase-safe; `required` defaults to `true`.
- **Export** downloads the current manifest as a file. The manifest is the source of truth — SQLite stores only metadata.
- **Validate against a server**: a read-only check of the pack against a server's `mods/` directory. It reports `ok`, `missing`, `version-mismatch` (same mod, different filename, e.g. `sodium-0.5.0.jar` vs `sodium.jar`), `checksum-mismatch`, and `unexpected` jars — and never writes to `mods/`.

### Networking

- The **Network access** panel on a server resolves the LAN addresses clients should use to join: private IPv4 addresses first, loopback as a last resort, each as `host:port` with a copy button.
- Resolution goes through a swappable **`NetworkProvider`** abstraction (`backend/src/networking/`). The local provider is registered by default; a per-server `network_provider` column and `GET /api/networking/providers` are the seams for future port-forward/tunnel providers. See [docs/networking.md](docs/networking.md).

### Launcher (client distribution)

The `launcher/` workspace is a self-contained Node CLI (no runtime dependencies) that applies a modpack anywhere the manager isn't running — the seed of a client-side distribution story:

```bash
npm run launcher:validate -- <manifest.json> [--dir <modsDir>]   # schema + read-only report
npm run launcher:sync     -- <manifest.json> --dir <modsDir>     # download + verify sha256
npm run launcher:launch   -- [<manifest.json>] --dir <serverDir> # preflight sync, then run
```

- `validate` checks the schema and, with `--dir`, produces the same report levels as the API (ok/missing/version-mismatch/checksum-mismatch/unexpected) without writing anything.
- `sync` downloads missing or checksum-mismatched mods from their `downloadUrl`, verifies each against `sha256`, recognizes version lookalikes, and leaves unexpected jars untouched.
- `launch` optionally syncs first, then spawns the Fabric server (`-Xms`/`-Xmx`, `-jar <fabric-server-*.jar|server.jar> nogui`).

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
| GET | `/api/servers/:id/metrics` | Latest sample + short history (CPU%, RAM) for a running server |
| GET | `/api/servers/:id/players` | Online player list + join/leave activity feed |
| GET | `/api/servers/:id/network` | Resolved connection addresses (LAN) the clients use to join |
| GET | `/api/networking/providers` | Registered network providers |
| GET | `/api/modpacks` | List modpacks |
| POST | `/api/modpacks` | Create a modpack from a manifest |
| POST | `/api/modpacks/import` | Import a manifest from JSON text (`{text}`) |
| GET/PUT/DELETE | `/api/modpacks/:id` | Read/update/delete a modpack |
| GET | `/api/modpacks/:id/manifest` | Export the raw manifest JSON |
| GET | `/api/modpacks/:id/validate?serverId=` | Read-only report of the pack against a server's `mods/` |

## Documentation

- [docs/architecture.md](docs/architecture.md) — backend architecture and component responsibilities
- [docs/minecraft-server-setup.md](docs/minecraft-server-setup.md) — how to install and register a Fabric Minecraft server
- [docs/modpack-system.md](docs/modpack-system.md) — modpack manifest format, validation and distribution plan
- [docs/networking.md](docs/networking.md) — LAN-first networking and the `NetworkProvider` abstraction

## Known limitations

- CPU/RAM sampling is implemented for Linux (`/proc`) and Windows (`Get-Process`); on other platforms metrics are simply not collected. CPU% needs two samples (≈5 s) to appear.
- Player join/leave detection relies on standard console lines (`joined the game` / `left the game`); servers that suppress or rename those lines will not update the list (RCON-based probing is a possible follow-up).
- Only the **local** network provider is implemented; `port-forward` and `tunnel` providers are registered seams, not shipped.
- The launcher syncs mods into a directory and runs a server; it is not a Minecraft *client* installer (no game/libraries download).
- No authentication: the manager binds locally / on your LAN by default. Do not expose it directly to the public internet.

## Roadmap

1. ✅ **Server management** — instance CRUD, directory detection, process manager (start/stop/restart, safe spawning)
2. ✅ **Console** — persistent console log, live WebSocket streaming, autoscroll, highlighting, command input with history
3. ✅ **Configuration** — `server.properties` editor (structured form + raw mode) on top of the round-tripping parser
4. ✅ **Monitoring** — CPU/RAM sampling, uptime/PID, online players with a join/leave feed, live WebSocket updates
5. ✅ **Modpacks** — manifests, import/export, checksum validation (and read-only validation against a server)
6. ✅ **Networking** — LAN connection info, `NetworkProvider` abstraction
7. ✅ **Client distribution** — a companion launcher that reads manifests, verifies `sha256` and launches the server

See [docs/modpack-system.md](docs/modpack-system.md) and [docs/networking.md](docs/networking.md) for the forward-looking plans.