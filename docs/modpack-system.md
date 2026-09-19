# Modpack system

A modpack is an **immutable, exportable manifest** describing the mod environment a server (and, later, a client launcher) should have. The manager stores metadata in SQLite but the manifest is the source of truth.

## Manifest format

```json
{
  "name": "My Survival Pack",
  "version": "1.0.0",
  "minecraftVersion": "1.21.4",
  "loader": "fabric",
  "loaderVersion": "0.16.14",
  "mods": [
    {
      "id": "fabric-api",
      "name": "Fabric API",
      "version": "0.118.0+1.21.4",
      "filename": "fabric-api-0.118.0+1.21.4.jar",
      "downloadUrl": "https://...",
      "sha256": "6a5b3d9e...",
      "required": true
    }
  ]
}
```

Rules:

- `id` is stable and unique within a modpack; `version` is the mod version.
- `filename` must be an exact match against the file in `mods/`.
- `sha256` (hex) enables checksum verification. Provide it for managed downloads.
- `required: false` marks optional client-side mods (e.g. minimaps) that are recommended but not mandatory.

## Planned API

```text
GET    /api/modpacks
GET    /api/modpacks/:id
POST   /api/modpacks
PUT    /api/modpacks/:id
DELETE /api/modpacks/:id

GET    /api/modpacks/:id/manifest        → manifest JSON (export)
GET    /api/modpacks/:id/validate        → validation report for a server
```

Validation is a separate operation from synchronization. The manager may **report** missing/unexpected/version/checksum mismatches but never silently writes to `mods/`.

## Validation report

```text
✓ Fabric API                ok
✓ Sodium                    ok
✗ Missing: ExampleMod       not present in mods/
⚠ Version mismatch: AnotherMod   expected 1.0.2, found 1.0.1
✕ Checksum mismatch: Sodium checksum for sodium-0.6.0.jar does not match
```

## Distribution architecture (future launcher)

```text
Minecraft Manager Launcher
        │
        ▼
Read server/modpack manifest
        │
        ▼
Compare local files
        ├── Correct → Launch Minecraft
        └── Missing → Download
                         │
                         ▼
                    Verify SHA256
                         │
                         ▼
                    Launch Minecraft
```

The manager's job in this milestone is to:

1. define the manifest format (above),
2. expose manifest import/export through the API,
3. implement server-side validation against an instance's `mods/`,
4. document the launcher contract so a companion client can be built later.

We deliberately do **not** attempt Minecraft-protocol-level mod downloading: clients need the correct mod environment before joining, which is exactly what the launcher solves.