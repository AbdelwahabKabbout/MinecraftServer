import fs from "node:fs";
import path from "node:path";
import { parseManifestText } from "./manifest.js";
import { syncMods, validateMods } from "./sync.js";
import { launchServer, resolveServerJar, type LaunchOptions } from "./launch.js";

export interface CliContext {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

export interface CliResult {
  code: 0 | 1;
  message?: string;
}

function readManifestOrExit(filePath: string, ctx: CliContext): ReturnType<typeof parseManifestText> | null {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    ctx.stderr(`Could not read manifest: ${(error as Error).message}`);
    return null;
  }
  const parsed = parseManifestText(text);
  if (!parsed.ok) {
    for (const issue of parsed.issues) {
      ctx.stderr(`  · ${issue.path}: ${issue.message}`);
    }
    return parsed;
  }
  return parsed;
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(`--${flag}`);
  if (index === -1) return undefined;
  return args[index + 1];
}

function flagsOnly(args: string[]): string[] {
  return args.filter((arg) => !arg.startsWith("--"));
}

export async function runCli(argv: string[], ctx: CliContext): Promise<CliResult> {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    ctx.stdout(usage());
    return { code: 0 };
  }

  if (command === "validate") {
    const manifestPath = flagsOnly(rest)[0];
    if (!manifestPath) return { code: 1, message: "Usage: launcher validate <manifest.json> [--dir <modsDir>]" };
    const parsed = readManifestOrExit(manifestPath, ctx);
    if (!parsed) return { code: 1 };
    if (!parsed.ok) return { code: 1, message: `Manifest is invalid (${parsed.issues.length} issue(s)).` };
    ctx.stdout(`Manifest valid: ${parsed.manifest.name} v${parsed.manifest.version} · MC ${parsed.manifest.minecraftVersion} · ${parsed.manifest.mods.length} mods`);

    const modsDir = flagValue(rest, "dir");
    if (modsDir) {
      const result = await validateMods(parsed.manifest, modsDir);
      for (const issue of result.issues) {
        ctx.stdout(`  [${issue.level}] ${issue.filename} — ${issue.message}`);
      }
      const s = result.summary;
      ctx.stdout(`Summary: ${s.ok} ok, ${s.missing} missing, ${s.versionMismatch} version mismatches, ${s.checksumMismatch} checksum mismatches, ${s.unexpected} unexpected`);
    }
    return { code: 0 };
  }

  if (command === "sync") {
    const manifestPath = flagsOnly(rest)[0];
    const modsDir = flagValue(rest, "dir");
    if (!manifestPath || !modsDir) return { code: 1, message: "Usage: launcher sync <manifest.json> --dir <modsDir>" };
    const parsed = readManifestOrExit(manifestPath, ctx);
    if (!parsed) return { code: 1 };
    if (!parsed.ok) return { code: 1, message: `Manifest is invalid (${parsed.issues.length} issue(s)).` };

    const result = await syncMods(parsed.manifest, modsDir);
    for (const action of result.actions) {
      ctx.stdout(`  [${action.action}] ${action.filename} — ${action.message}`);
    }
    const { downloaded, redownloaded, unwanted, errors } = result.summary;
    ctx.stdout(`Downloaded ${downloaded}, redownloaded ${redownloaded}, left ${unwanted} unwanted files untouched, ${errors} error(s).`);
    return errors > 0 ? { code: 1 } : { code: 0 };
  }

  if (command === "launch") {
    const serverDir = flagValue(rest, "dir") ?? ".";
    const java = flagValue(rest, "java") ?? "java";
    const min = Number(flagValue(rest, "min") ?? "1024");
    const max = Number(flagValue(rest, "max") ?? "2048");

    const manifestPath = flagsOnly(rest)[0];
    const preflight = manifestPath ? readManifestOrExit(manifestPath, ctx) : null;
    if (manifestPath && !preflight) return { code: 1 };
    if (manifestPath && preflight && !preflight.ok) return { code: 1, message: `Manifest is invalid (${preflight.issues.length} issue(s)).` };
    if (manifestPath && preflight && preflight.ok) {
      const result = await syncMods(preflight.manifest, path.join(serverDir, "mods"));
      for (const action of result.actions) ctx.stdout(`  [${action.action}] ${action.filename} — ${action.message}`);
      if (result.summary.errors > 0) return { code: 1, message: "Sync failed; aborting launch." };
    }

    const serverJar = resolveServerJar(serverDir);
    if (!serverJar) return { code: 1, message: `No fabric-server-*.jar or server.jar found in ${serverDir}` };
    const options: LaunchOptions = {
      java,
      serverJar: path.join(serverDir, serverJar),
      workingDir: serverDir,
      memoryMinMb: min,
      memoryMaxMb: max,
      stdio: "inherit",
    };
    const started = launchServer(options);
    if (!started.started) return { code: 1, message: started.error };
    ctx.stdout(`Server started (pid ${started.child.pid}). Launcher jar: ${serverJar}`);
    return { code: 0 };
  }

  return { code: 1, message: `Unknown command '${command}'.\n\n${usage()}` };
}

function usage(): string {
  return [
    "Minecraft Manager Launcher",
    "Applies a modpack manifest to a mods directory and runs a Fabric server.",
    "",
    "  launcher validate <manifest.json> [--dir <modsDir>]",
    "  launcher sync     <manifest.json> --dir <modsDir>",
    "  launcher launch   [<manifest.json>] --dir <serverDir> [--java <path>] [--min <Mb>] [--max <Mb>]",
  ].join("\n");
}

const isMainModule = process.argv[1] ? import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href : false;
if (isMainModule) {
  const ctx: CliContext = { stdout: (line) => process.stdout.write(`${line}\n`), stderr: (line) => process.stderr.write(`${line}\n`) };
  const result = await runCli(process.argv.slice(2), ctx);
  if (result.message) {
    if (result.code === 0) ctx.stdout(result.message);
    else ctx.stderr(result.message);
  }
  process.exit(result.code);
}