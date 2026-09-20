import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { serverRepository } from "../repositories/serverRepository.js";
import { modpackRepository } from "../repositories/modpackRepository.js";
import { paths } from "../config/index.js";
import { resolveSafePath } from "../utils/pathSafety.js";
import { parseModpackManifest, parseModpackManifestText, type ModpackManifest } from "../modpacks/manifest.js";
import { slugify } from "../utils/slugify.js";

export interface ValidationIssue {
  level: "ok" | "missing" | "version-mismatch" | "checksum-mismatch" | "unexpected";
  modId?: string;
  filename?: string;
  expected?: string;
  found?: string;
  message: string;
}

export interface ValidationReport {
  serverId: string;
  summary: { total: number; ok: number; missing: number; versionMismatch: number; checksumMismatch: number; unexpected: number };
  issues: ValidationIssue[];
}

export class ModpackService {
  async createManifest(input: unknown) {
    const manifest = parseModpackManifest(input);
    return this.saveFromInput(manifest);
  }

  async importManifest(text: string) {
    const manifest = parseModpackManifestText(text);
    return this.saveFromInput(manifest);
  }

  saveFromInput(manifest: ModpackManifest) {
    const base = slugify(manifest.name);
    let slug = base;
    let counter = 2;
    while (modpackRepository.findBySlug(slug)) {
      slug = `${base}-${counter}`;
      counter += 1;
    }
    return modpackRepository.create({
      id: randomUUID(),
      slug,
      name: manifest.name,
      version: manifest.version,
      minecraftVersion: manifest.minecraftVersion,
      loader: manifest.loader,
      loaderVersion: manifest.loaderVersion ?? null,
      manifest: JSON.stringify(manifest),
    });
  }

  updateFromInput(id: string, input: unknown) {
    const manifest = parseModpackManifest(input);
    return modpackRepository.update(id, {
      name: manifest.name,
      version: manifest.version,
      minecraftVersion: manifest.minecraftVersion,
      loader: manifest.loader,
      loaderVersion: manifest.loaderVersion ?? null,
      manifest: JSON.stringify(manifest),
    });
  }

  list() {
    return modpackRepository.list();
  }

  get(id: string) {
    return modpackRepository.getOrThrow(id);
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    await modpackRepository.delete(id);
    return { id, deleted: true };
  }

  /**
   * Validates a modpack's manifest against a server's `mods/` directory,
   * without writing anything. Reports ok/missing/version-mismatch/
   * checksum-mismatch/unexpected per file.
   */
  async validate(modpackId: string, serverId: string): Promise<ValidationReport> {
    const { manifest } = modpackRepository.getOrThrow(modpackId);
    const server = serverRepository.getOrThrow(serverId);
    const dir = resolveSafePath(paths.serverRoot, server.serverDirectory);
    const modsDir = path.join(dir, "mods");

    const expected = new Map<string, ModpackManifest["mods"][number]>();
    for (const mod of manifest.mods) expected.set(mod.filename, mod);

    const issues: ValidationIssue[] = [];
    let ok = 0;
    let missing = 0;
    let versionMismatch = 0;
    let checksumMismatch = 0;
    const claimedByLookalike = new Set<string>();

    for (const mod of manifest.mods) {
      const filePath = path.join(modsDir, mod.filename);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
          missing += 1;
          issues.push({ level: "missing", modId: mod.id, filename: mod.filename, message: `Expected ${mod.filename} but it is not a file.` });
          continue;
        }
        if (mod.sha256) {
          const digest = await sha256File(filePath);
          if (digest !== mod.sha256) {
            checksumMismatch += 1;
            issues.push({ level: "checksum-mismatch", modId: mod.id, filename: mod.filename, message: `Checksum mismatch for ${mod.filename}.` });
            continue;
          }
        }
        ok += 1;
        issues.push({ level: "ok", modId: mod.id, filename: mod.filename, message: `${mod.name} is present and verified.` });
      } else {
        const similar = findVersionLookalike(modsDir, mod.id);
        if (similar) {
          claimedByLookalike.add(similar);
          versionMismatch += 1;
          issues.push({
            level: "version-mismatch",
            modId: mod.id,
            filename: mod.filename,
            expected: mod.filename,
            found: similar,
            message: `Expected ${mod.filename} but found ${similar}.`,
          });
        } else {
          missing += 1;
          issues.push({ level: "missing", modId: mod.id, filename: mod.filename, message: `${mod.name} (${mod.version}) is not present in mods/.` });
        }
      }
    }

    const unexpected = listJars(modsDir).filter((file) => !expected.has(file) && !claimedByLookalike.has(file));
    for (const filename of unexpected) {
      issues.push({ level: "unexpected", filename, message: `${filename} is not declared in the manifest.` });
    }

    return {
      serverId,
      summary: {
        total: manifest.mods.length,
        ok,
        missing,
        versionMismatch,
        checksumMismatch,
        unexpected: unexpected.length,
      },
      issues,
    };
  }
}

function listJars(modsDir: string): string[] {
  if (!fs.existsSync(modsDir)) return [];
  return fs
    .readdirSync(modsDir)
    .filter((name) => name.toLowerCase().endsWith(".jar"))
    .sort();
}

/** Finds a jar that looks like another version of the given mod id. */
function findVersionLookalike(modsDir: string, modId: string): string | null {
  const needle = modId.toLowerCase();
  const candidates = listJars(modsDir).filter((name) => {
    const lower = name.toLowerCase().replace(/\.jar$/, "");
    return lower.includes(needle) || lower.startsWith(needle);
  });
  return candidates.length > 0 ? candidates[0]! : null;
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk as Buffer));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

export const modpackService = new ModpackService();