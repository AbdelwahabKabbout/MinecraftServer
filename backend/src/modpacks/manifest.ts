import { z } from "zod";
import { ApiError } from "../utils/api.js";

export const modEntrySchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9._-]+$/, "Use lowercase [a-z0-9._-] for mod ids."),
  name: z.string().min(1).max(128),
  version: z.string().min(1).max(64),
  filename: z.string().min(1).max(200).regex(/^[A-Za-z0-9._+()\- ]+\.jar$/, "Filename must end in .jar and contain no path separators."),
  downloadUrl: z.string().url().optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "sha256 must be a 64-character lowercase hex digest.")
    .optional(),
  required: z.boolean().optional().default(true),
});

export const modpackManifestSchema = z.object({
  name: z.string().min(1).max(64),
  version: z.string().min(1).max(32),
  minecraftVersion: z.string().regex(/^\d+\.\d+(\.\d+)?$/, "minecraftVersion must look like 1.21.4."),
  loader: z.enum(["fabric"]).default("fabric"),
  loaderVersion: z.string().min(1).max(32).optional(),
  mods: z.array(modEntrySchema).max(500),
});

export type ModpackManifest = z.infer<typeof modpackManifestSchema>;
export type ModEntry = z.infer<typeof modEntrySchema>;

/**
 * Validates a manifest object. Returns the parsed manifest or throws a 400
 * `VALIDATION_ERROR` carrying a flattened Zod report.
 */
export function parseModpackManifest(input: unknown): ModpackManifest {
  const result = modpackManifestSchema.safeParse(input);
  if (!result.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid modpack manifest.", 400, result.error.flatten());
  }

  const mods = result.data.mods;
  const ids = new Set<string>();
  for (const mod of mods) {
    if (ids.has(mod.id)) {
      throw new ApiError("VALIDATION_ERROR", `Duplicate mod id "${mod.id}".`, 400);
    }
    ids.add(mod.id);
  }
  return result.data;
}

export function parseModpackManifestText(text: string): ModpackManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Manifest is not valid JSON.", 400);
  }
  return parseModpackManifest(parsed);
}