# Architecture

This document describes the Minecraft Server Manager backend architecture. It is intentionally written as the foundation for later milestones: process management, live console, monitoring and modpacks will slot into the interfaces defined here.

## Principles

1. **The backend is the application.** The frontend is a management interface over a core that talks to the filesystem, spawns Java processes and reads the database.
2. **Metadata vs. runtime files.** SQLite stores metadata (definitions, modpack manifests, sync state). Minecraft worlds, `server.properties`, `mods/`, `config/` and logs live on disk and are owned by the server.
3. **Safe process control.** No arbitrary shell commands are ever built from user input. Java is spawned with explicit argument arrays.
4. **Predictable errors.** Every API error returns the same envelope so the UI can rely on it.
5. **Local first.** The default bind is local/LAN. Global networking is deferred behind a provider abstraction.

## Components

### API layer (`backend/src/routes`, `server.ts`)

- Fastify application factory with CORS (dev-only permissive), a registered WebSocket plugin, a global error handler and a uniform 404 handler.
- The `/ws` endpoint hosts the broadcast hub for typed events: `server.status`, `server.console`, `server.consoleCleared` (and later `server.metrics`).
- Response envelope:

  ```json
  // success
  { "success": true,  "data": { ... } }

  // failure
  { "success": false, "error": { "code": "SERVER_ALREADY_RUNNING", "message": "..." } }
  ```

- All manager endpoints are mounted under `/api`. The bare `/` and `/api` routes advertise the API.
- Server routes (`routes/servers.ts`) cover CRUD, status, detection, start/stop/restart, command and console.

### Database (`backend/src/db`, `repositories/`)

- SQLite via `better-sqlite3`, accessed through Drizzle ORM.
- Schema is defined in `src/db/schema.ts`: `app_meta` (small key/value metadata), `servers` (instance configuration only) and `console_logs` (persisted console output per server). Migrations are generated with Drizzle Kit into `backend/drizzle/` and applied on startup (and manually with `db:migrate`).
- The schema stores metadata only. Minecraft files (worlds, jars, properties) are never duplicated into tables.
- `repositories/serverRepository.ts` and `repositories/consoleRepository.ts` are thin data-access layers over Drizzle.

### Configuration (`backend/src/config`)

- `.env` is parsed and validated with Zod. Unknown/malformed values fail fast with a readable message.
- `paths.serverRoot` (default `./servers`) is the root for all server instance directories and must contain only server data.
- `SHUTDOWN_TIMEOUT_MS` controls the graceful-stop window before a force-kill.

### Server management core (`backend/src/minecraft`, `services/`)

- **State machine** (`minecraft/serverState.ts`): `OFFLINE → STARTING→ ONLINE`, with `STOPPING` and `CRASHED`; every transition is validated.
- **Detection** (`minecraft/detection.ts`): read-only scan of an instance directory — preferred launcher jar (Fabric launcher before `server.jar`), `server.properties`, `eula.txt` acceptance, and structural directories (`mods/`, `config/`, `world/`, `logs/`, `crash-reports/`). Returns human-readable blocking issues.
- **server.properties** (`minecraft/serverProperties.ts`): parse/update that round-trips comments, ordering and unknown keys.
- **Process manager** (`minecraft/processManager.ts`): spawns `java -Xms.. -Xmx.. -jar <jar> nogui` in the server directory with explicit argument arrays, detects `Done (...)` for `ONLINE`, supports graceful stop with timeout + force-kill, restart, stdin commands, a bounded console buffer, and marks unexpected exits as `CRASHED`. The spawn function is injectable for tests.
- **Service** (`services/serverService.ts`): normalizes/de-duplicates directories, generates unique slugs, prevents editing/deleting running instances, persists state changes and broadcasts `server.status`/`server.console` through the hub, and forwards console output to the log service.
- **Console log** (`services/consoleService.ts`, `repositories/consoleRepository.ts`): batches console lines into SQLite (flushed every 100ms) and prunes each server's history to the newest 2000 rows, so the console survives process restarts and reloads. `GET /api/servers/:id/console` reads history oldest-first (optional `limit`); `DELETE` clears it (history is also removed when the server is deleted).
- **Path safety** (`utils/pathSafety.ts`): every instance directory is validated as a relative path under `serverRoot` — no traversal, no absolute paths, no drive segments.

### Console frontend (`frontend/src/components/ConsolePanel.vue`)

- Renders the timestamped log from the Pinia store, merged from `GET /console` history and live WS lines (deduplicated on `timestamp + line`).
- Auto-scrolls to the bottom while following; pausing on scroll-up reveals a "Jump to bottom" button.
- Command input with keyboard history (↑/↓), disabled while the server is stopped.
- Line highlighting: `[manager]` markers, `ERROR`/`EXCEPTION` and `WARN` classes.

### Logging (`backend/src/config/logger`)

- Pino with pretty output in development. Application lifecycle events are logged here.
- Minecraft console output is captured by the process manager, buffered per instance, and streamed over WebSocket.

## Planned components (later milestones)

| Component            | Responsibility                                                                 |
| -------------------- | ------------------------------------------------------------------------------ |
| `minecraft/version`  | JAR/version probing and `server.properties` editing UI                         |
| `monitoring/`        | CPU/RAM metrics, player join/leave detection, live `server.metrics` events     |
| `modpacks/`          | Manifest model, validation (missing/unexpected/version/checksum), import/export |
| `networking/`        | `NetworkProvider` interface with a `LocalNetworkProvider` implementation        |

## Process safety rules

- Never build shell command strings from user input.
- Spawn with `child_process.spawn(exe, argsArray, ...)`, never `exec`.
- Validate every filesystem path against `paths.serverRoot`; reject named-pipe, device and traversal paths.
- Only pre-approved executables may be launched (configurable `javaPath`).

## Error handling contract

Errors thrown by route handlers, validation and services are normalized:

- `VALIDATION_ERROR` (zod) → 400 with per-field details
- `NOT_FOUND` (unknown route/resource) → 404
- Domain errors (`ApiError`) → 4xx with a stable `code`
- Anything else → 500 `INTERNAL_ERROR` (details only in backend logs)

The frontend (`services/api.ts`) unwraps this shape and surfaces user-readable messages.