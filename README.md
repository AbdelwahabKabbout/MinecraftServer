# Minecraft Server Manager

A local-first web application for creating, controlling, monitoring and configuring Minecraft **Java Edition** server instances, with an architecture ready for modpack management and client-side modpack distribution.

> **Status: Foundation (Phase 1).** This milestone lays the project skeleton: backend API + database, frontend dashboard shell, environment configuration, testing and documentation. Server process management, live console, metrics and modpacks are implemented in subsequent milestones.

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

Adjust `HTTP_PORT`, `DATABASE_URL`, `SERVER_ROOT`, `JAVA_PATH` and memory defaults as needed. Never commit `.env`.

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
│   │   ├── routes/        Fastify routes + error handler
│   │   ├── utils/         API envelope, version
│   │   ├── server.ts      Fastify app factory (WebSocket-ready)
│   │   └── index.ts       entry point
│   ├── drizzle/           generated SQL migrations
│   └── package.json
├── frontend/
│   └── src/
│       ├── components/    reusable UI
│       ├── views/         pages (dashboard, servers, modpacks, settings)
│       ├── layouts/       app shell (sidebar)
│       ├── stores/        Pinia state
│       ├── services/      API client (axios + WebSocket-ready)
│       ├── router/
│       └── main.ts
├── servers/               Minecraft server instances live here (gitignored)
├── docs/                  architecture and feature documentation
├── .env.example
└── README.md
```

## Configuring a Minecraft server

The manager registers and controls existing server installations. See [docs/minecraft-server-setup.md](docs/minecraft-server-setup.md).

## Documentation

- [docs/architecture.md](docs/architecture.md) — backend architecture and component responsibilities
- [docs/minecraft-server-setup.md](docs/minecraft-server-setup.md) — how to install and register a Fabric Minecraft server
- [docs/modpack-system.md](docs/modpack-system.md) — modpack manifest format, validation and distribution plan
- [docs/networking.md](docs/networking.md) — LAN-first networking and the `NetworkProvider` abstraction

## Known limitations (Phase 1)

- Server instance management (create/start/stop/console/metrics) is **not yet implemented** — the dashboard shell is wired for it
- Modpack definitions and validation are **not yet implemented**
- No authentication: the manager binds locally / on your LAN by default. Do not expose it directly to the public internet.

## Roadmap

1. **Server management** — instance CRUD, directory detection, process manager (start/stop/restart, safe spawning)
2. **Console** — stdout/stderr capture, WebSocket live console, command input
3. **Configuration** — `server.properties` parser/writer
4. **Monitoring** — CPU/RAM metrics, player join/leave detection, live WebSocket updates
5. **Modpacks** — manifests, import/export, checksum validation
6. **Networking** — LAN connection info, `NetworkProvider` abstraction
7. **Client distribution** — a companion launcher that reads manifests, verifies `sha256` and launches Minecraft

See [docs/modpack-system.md](docs/modpack-system.md) and [docs/networking.md](docs/networking.md) for the forward-looking plans.