export interface ModEntry {
  id: string;
  name: string;
  version: string;
  filename: string;
  downloadUrl?: string;
  sha256?: string;
  required: boolean;
}

export interface ModpackManifest {
  name: string;
  version: string;
  minecraftVersion: string;
  loader: "fabric";
  loaderVersion?: string;
  mods: ModEntry[];
}

export interface ManifestIssue {
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; manifest: ModpackManifest }
  | { ok: false; issues: ManifestIssue[] };

const ID_PATTERN = /^[a-z0-9._-]+$/;
const FILENAME_PATTERN = /^[A-Za-z0-9._+()\- ]+\.jar$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MC_VERSION_PATTERN = /^\d+\.\d+(\.\d+)?$/;
const LOADERS = ["fabric"] as const;
const MAX_MODS = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textField(value: unknown, path: string, max: number, required: boolean, issues: ManifestIssue[]): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    issues.push({ path, message: required ? `Must be a non-empty string (max ${max} chars).` : `Must be a string (max ${max} chars).` });
    return undefined;
  }
  return value;
}

export function parseModEntry(value: unknown, modIndex: number, issues: ManifestIssue[]): ModEntry | null {
  const path = `mods[${modIndex}]`;
  if (!isRecord(value)) {
    issues.push({ path, message: "Must be an object." });
    return null;
  }

  const entryIssues: ManifestIssue[] = [];
  const id = textField(value.id, `${path}.id`, 64, true, entryIssues);
  if (id !== undefined && !ID_PATTERN.test(id)) {
    entryIssues.push({ path: `${path}.id`, message: "Lowercase letters, digits, '.', '_', '-' only." });
  }
  const name = textField(value.name, `${path}.name`, 64, true, entryIssues);
  const version = textField(value.version, `${path}.version`, 32, true, entryIssues);
  const filename = textField(value.filename, `${path}.filename`, 256, true, entryIssues);
  if (filename !== undefined && !FILENAME_PATTERN.test(filename)) {
    entryIssues.push({ path: `${path}.filename`, message: "Must be a plain *.jar filename (no paths)." });
  }
  const downloadUrl = textField(value.downloadUrl, `${path}.downloadUrl`, 2048, false, entryIssues);
  if (downloadUrl !== undefined) {
    let parsed: URL;
    try {
      parsed = new URL(downloadUrl);
    } catch {
      parsed = undefined as never;
    }
    if (parsed === undefined) {
      entryIssues.push({ path: `${path}.downloadUrl`, message: "Must be a valid URL." });
    } else if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      entryIssues.push({ path: `${path}.downloadUrl`, message: "Must use http(s)." });
    }
  }
  const sha256 = value.sha256 === undefined ? undefined : textField(value.sha256, `${path}.sha256`, 64, false, entryIssues);
  if (sha256 !== undefined && !SHA256_PATTERN.test(sha256)) {
    entryIssues.push({ path: `${path}.sha256`, message: "Must be a 64-char lowercase hex digest." });
  }
  let required = true;
  if (value.required !== undefined) {
    if (typeof value.required !== "boolean") {
      entryIssues.push({ path: `${path}.required`, message: "Must be a boolean." });
    } else {
      required = value.required;
    }
  }

  issues.push(...entryIssues);
  if (id === undefined || name === undefined || version === undefined || filename === undefined) return null;
  return { id, name, version, filename, downloadUrl, sha256, required };
}

export function parseManifest(value: unknown): ParseResult {
  const issues: ManifestIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "Manifest must be a JSON object." }] };
  }

  const name = textField(value.name, "name", 64, true, issues);
  const version = textField(value.version, "version", 32, true, issues);
  const minecraftVersion = textField(value.minecraftVersion, "minecraftVersion", 16, true, issues);
  if (minecraftVersion !== undefined && !MC_VERSION_PATTERN.test(minecraftVersion)) {
    issues.push({ path: "minecraftVersion", message: "Expected a Minecraft version like 1.21.4." });
  }
  const loaderIssues: ManifestIssue[] = [];
  const loader = textField(value.loader, "loader", 16, true, loaderIssues);
  if (loader !== undefined && !(LOADERS as readonly string[]).includes(loader)) {
    loaderIssues.push({ path: "loader", message: `Unsupported loader '${loader}'. Supported: ${LOADERS.join(", ")}.` });
  }
  issues.push(...loaderIssues);
  const loaderVersion = textField(value.loaderVersion, "loaderVersion", 32, false, issues);

  let mods: ModEntry[] = [];
  if (value.mods !== undefined) {
    if (!Array.isArray(value.mods) || value.mods.length > MAX_MODS) {
      issues.push({ path: "mods", message: `Must be an array of at most ${MAX_MODS} entries.` });
    } else {
      mods = value.mods.flatMap((entry, index) => {
        const parsed = parseModEntry(entry, index, issues);
        return parsed ? [parsed] : [];
      });
    }
  } else {
    issues.push({ path: "mods", message: "Required." });
  }

  if (issues.length > 0) return { ok: false, issues };

  const seenIds = new Set<string>();
  for (const mod of mods) {
    if (seenIds.has(mod.id)) {
      issues.push({ path: "mods", message: `Duplicate mod id '${mod.id}'.` });
    }
    seenIds.add(mod.id);
  }
  if (issues.length > 0) return { ok: false, issues };

  return { ok: true, manifest: { name: name!, version: version!, minecraftVersion: minecraftVersion!, loader: loader as "fabric", loaderVersion, mods } };
}

export function parseManifestText(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, issues: [{ path: "$", message: `Invalid JSON: ${(error as Error).message}` }] };
  }
  return parseManifest(value);
}