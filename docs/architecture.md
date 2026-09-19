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

- Fastify application factory with CORS (dev-only permissive), a registered WebSocket plugin (reserved for live console/status/metrics), a global error handler and a uniform 404 handler.
- Response envelope:

  ```json
  // success
  { "success": true,  "data": { ... } }

  // failure
  { "success": false, "error": { "code": "SERVER_ALREADY_RUNNING", "message": "..." } }
  ```

- All manager endpoints are mounted under `/api`. The bare `/` and `/api` routes advertise the API.

### Database (`backend/src/db`)

- SQLite via `better-sqlite3`, accessed through Drizzle ORM.
- Schema is defined in `src/db/schema.ts`. Migrations are generated with Drizzle Kit (`npm run db:generate`) into `backend/drizzle/` and applied on startup (and manually with `db:migrate`).
- The schema is deliberately minimal. Files that belong to Minecraft (worlds, jars, properties) are not duplicated into tables.

### Configuration (`backend/src/config`)

- `.env` is parsed and validated with Zod. Unknown/malformed values fail fast with a readable message.
- `paths.serverRoot` (default `./servers`) is the root for all server instance directories and must contain only server data.

### Logging (`backend/src/config/logger`)

- Pino with pretty output in development. Application lifecycle events are logged here.
- Minecraft console output is handled separately by the process manager and streamed over WebSocket (see roadmap).

## Planned components (later milestones)

| Component            | Responsibility                                                                 |
| -------------------- | ------------------------------------------------------------------------------ |
| `services/process`   | Launch/stop/restart Java, `stop` command + graceful timeout, exit-surprise detection (`CRASHED`) |
| `minecraft/`         | Loader abstraction (Fabric first), server.jar/version probing, console parser  |
| `minecraft/properties` | `server.properties` parse/write preserving unknown keys                       |
| `modpacks/`          | Manifest model, validation (missing/unexpected/version/checksum), import/export |
| `networking/`        | `NetworkProvider` interface with a `LocalNetworkProvider` implementation        |
| `websocket/`         | Typed event bus: `server.status`, `server.console`, `server.metrics`, player events |

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