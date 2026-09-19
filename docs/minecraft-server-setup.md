# Minecraft server setup

The manager controls *existing*, on-disk Minecraft server installations. It does not (yet) download Minecraft automatically — that is a future milestone. This guide walks through installing a Fabric server and preparing it for registration.

## 1. Install Java

The manager requires a Java runtime on the host machine. Java 17+ is required for modern versions; Java 21 is the current LTS and recommended for Minecraft 1.20.5+.

Check your installation:

```powershell
java -version
```

If `java` is not on `PATH`, note the full path (e.g. `C:\Program Files\Java\jdk-21\bin\java.exe`) — each server instance stores its own `javaPath`.

## 2. Create a server directory

All instances live under the configured server root (default `servers/` in the repository root). Create one directory per instance:

```text
servers/
├── survival/     ← this instance
└── (future instances...)
```

## 3. Install a Fabric server

For a Fabric server you need the Fabric server launcher jar plus the Fabric loader.

1. Download the matching **server** jar for your Minecraft version from the [Fabric](https://fabricmc.net/use/server/) installer.
2. Place the launcher jar in the instance directory, e.g.:

   ```text
   servers/survival/
   ├── fabric-server-mc.1.21.4-loader.0.16.14-launcher.jar
   ```

   (Your loader version and MC version will differ.)

3. Generate the server files. First run:

   ```powershell
   cd servers\survival
   java -Xmx2G -jar fabric-server-mc.1.21.4-loader.0.16.14-launcher.jar nogui
   ```

   Accept the EULA when prompted (or set `eula=true` in `eula.txt`) and let it finish. This produces `server.properties`, `eula.txt`, `server.jar` (the vanilla jar the launcher wraps) and the standard directories (`world/`, `logs/`, `mods/`, `config/`).

## 4. Add mods (optional)

Drop Fabric mods into `servers/survival/mods/`. Examples to get started:

- **Fabric API** — required by almost every Fabric mod
- **Sodium, Lithium, Phosphor** — performance mods
- **Carpet, etc.** — as you prefer

The modpack milestone will let the manager track these as a manifest with `sha256` verification.

## 5. What the manager detects

The detection utility inspects an instance directory for (without assuming anything exists):

- `fabric-server-*.jar` launcher / `server.jar`
- `server.properties`
- `eula.txt`
- `mods/`, `config/`, `world/`, `logs/`, `crash-reports/`

Missing requirements are reported clearly (e.g. *"Server cannot start. Missing: eula.txt"*) instead of producing an obscure Node error.

## 6. Registering and running

Server registration arrives with the server-management milestone. From then on, starting is equivalent to:

```text
java -Xms<min> -Xmx<max> -jar <launcher jar> nogui
```

built from the instance's configured Java executable, memory limits and detected launcher jar — never from a user-supplied command string.

## Troubleshooting

| Symptom                     | Likely fix                                      |
| --------------------------- | ----------------------------------------------- |
| `java` not recognized       | Install Java or set the instance `javaPath`     |
| `Failed to bind to port`    | Another process holds the port; change `server-port` |
| Crash on first launch       | Accept the EULA; ensure the launcher jar and Java version match the MC version |
| Mods missing on join        | Loader version and Fabric API must match the MC version |