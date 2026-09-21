import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { downloadTo } from "./fetch.js";
import { verifyFile } from "./hash.js";
import type { ModEntry, ModpackManifest } from "./manifest.js";

export type SyncAction = "ok" | "downloaded" | "redownloaded" | "unwanted" | "no-url" | "error";

export interface SyncResult {
  modsDir: string;
  actions: Array<{ modId: string; filename: string; action: SyncAction; message: string }>;
  summary: { downloaded: number; redownloaded: number; unwanted: number; errors: number };
}

export async function listJars(modsDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(modsDir);
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.toLowerCase().endsWith(".jar")).sort();
}

/** Mirrors the manager's version-lookalike heuristic (same mod id, different filename). */
export function findVersionLookalike(jars: string[], modId: string): string | undefined {
  for (const jar of jars) {
    const withoutExtension = jar.slice(0, -4);
    if (withoutExtension.startsWith(`${modId}-`) || withoutExtension === modId) return jar;
  }
  return undefined;
}

export interface SyncCallbacks {
  download?: (url: string, destination: string) => Promise<{ ok: boolean; error?: string }>;
}

export type ValidationLevel = "ok" | "missing" | "version-mismatch" | "checksum-mismatch" | "unexpected";

export interface ValidationIssue {
  level: ValidationLevel;
  modId: string;
  filename: string;
  expected?: string;
  found?: string;
  message: string;
}

export interface ValidationReport {
  modsDir: string;
  issues: ValidationIssue[];
  summary: { total: number; ok: number; missing: number; versionMismatch: number; checksumMismatch: number; unexpected: number };
}

/** Read-only check of a manifest against a mods directory; never writes. */
export async function validateMods(manifest: ModpackManifest, modsDir: string): Promise<ValidationReport> {
  const jars = await listJars(modsDir);
  const expected = new Set(manifest.mods.map((mod) => mod.filename));
  const claimedByLookalike = new Set<string>();
  const issues: ValidationIssue[] = [];
  const summary = { total: manifest.mods.length, ok: 0, missing: 0, versionMismatch: 0, checksumMismatch: 0, unexpected: 0 };

  for (const mod of manifest.mods) {
    const filePath = path.join(modsDir, mod.filename);
    const status = await verifyFile(filePath, mod.sha256);
    if (status === "present") {
      summary.ok += 1;
      issues.push({ level: "ok", modId: mod.id, filename: mod.filename, message: `${mod.filename} present and verified.` });
    } else if (status === "checksum-mismatch") {
      summary.checksumMismatch += 1;
      issues.push({ level: "checksum-mismatch", modId: mod.id, filename: mod.filename, message: `Checksum mismatch for ${mod.filename}.` });
    } else {
      const similar = findVersionLookalike(jars, mod.id);
      if (similar) {
        claimedByLookalike.add(similar);
        summary.versionMismatch += 1;
        issues.push({ level: "version-mismatch", modId: mod.id, filename: mod.filename, expected: mod.filename, found: similar, message: `Expected ${mod.filename} but found ${similar}.` });
      } else {
        summary.missing += 1;
        issues.push({ level: "missing", modId: mod.id, filename: mod.filename, message: `${mod.filename} is not present.` });
      }
    }
  }

  const unexpected = jars.filter((jar) => !expected.has(jar) && !claimedByLookalike.has(jar));
  for (const jar of unexpected) {
    summary.unexpected += 1;
    issues.push({ level: "unexpected", modId: "", filename: jar, message: `${jar} is not in the manifest.` });
  }

  return { modsDir, issues, summary };
}

export async function syncMods(manifest: ModpackManifest, modsDir: string, callbacks: SyncCallbacks = {}): Promise<SyncResult> {
  await mkdir(modsDir, { recursive: true });
  const doDownload = callbacks.download ?? downloadTo;
  const jars = await listJars(modsDir);
  const claimedByLookalike = new Set<string>();
  const actions: SyncResult["actions"] = [];
  const summary = { downloaded: 0, redownloaded: 0, unwanted: 0, errors: 0 };

  for (const mod of manifest.mods) {
    const filePath = path.join(modsDir, mod.filename);
    const status = await verifyFile(filePath, mod.sha256);
    if (status === "present") {
      actions.push({ modId: mod.id, filename: mod.filename, action: "ok", message: `${mod.filename} already present.` });
      continue;
    }

    if (!mod.downloadUrl) {
      const similar = findVersionLookalike(jars, mod.id);
      if (similar) {
        claimedByLookalike.add(similar);
        actions.push({ modId: mod.id, filename: mod.filename, action: "error", message: `Expected ${mod.filename} but found ${similar}; no downloadUrl to reconcile.` });
      } else {
        actions.push({ modId: mod.id, filename: mod.filename, action: "no-url", message: `${mod.filename} missing and no downloadUrl.` });
      }
      continue;
    }

    const redownload = status === "checksum-mismatch";
    const result = await doDownload(mod.downloadUrl, filePath);
    if (!result.ok) {
      summary.errors += 1;
      actions.push({ modId: mod.id, filename: mod.filename, action: "error", message: `Failed to download ${mod.filename}: ${result.error}` });
      continue;
    }
    if (mod.sha256) {
      const after = await verifyFile(filePath, mod.sha256);
      if (after !== "present") {
        summary.errors += 1;
        actions.push({ modId: mod.id, filename: mod.filename, action: "error", message: `Downloaded ${mod.filename} failed checksum verification.` });
        continue;
      }
    }
    if (redownload) summary.redownloaded += 1;
    else summary.downloaded += 1;
    actions.push({
      modId: mod.id,
      filename: mod.filename,
      action: redownload ? "redownloaded" : "downloaded",
      message: redownload ? `${mod.filename} checksum mismatched, redownloaded.` : `Downloaded ${mod.filename} (${mod.sha256 ? "verified" : "unverified"}).`,
    });
  }

  const expected = new Set(manifest.mods.map((mod) => mod.filename));
  const unwanted = jars.filter((jar) => !expected.has(jar) && !claimedByLookalike.has(jar));
  for (const jar of unwanted) {
    summary.unwanted += 1;
    actions.push({ modId: "", filename: jar, action: "unwanted", message: `${jar} is not in the manifest and was left untouched.` });
  }

  return { modsDir, actions, summary };
}