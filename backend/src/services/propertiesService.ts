import fs from "node:fs";
import path from "node:path";
import { serverRepository } from "../repositories/serverRepository.js";
import { paths } from "../config/index.js";
import { resolveSafePath } from "../utils/pathSafety.js";
import { ApiError } from "../utils/api.js";
import {
  removeProperty,
  setProperty,
  parsePropertiesDoc,
  validatePropertiesText,
  isValidPropertyKey,
} from "../minecraft/serverProperties.js";

export interface ServerPropertiesReply {
  /** Relative path under serverRoot, e.g. `survival/server.properties`. */
  path: string;
  exists: boolean;
  /** Raw file contents (line endings and comments preserved), null when missing. */
  text: string | null;
  /** Ordered key/value pairs parsed from the file. */
  pairs: Array<{ key: string; value: string }>;
}

const MAX_PATCH_KEYS = 128;
const PROPERTIES_FILE = "server.properties";

function relativePropertiesPath(instanceDirectory: string): string {
  return path.join(instanceDirectory, PROPERTIES_FILE).split(path.sep).join("/");
}

/**
 * Reads and updates a server's `server.properties` file. Updates are
 * single-key patches applied to the on-disk document so comments, ordering and
 * unknown keys are never destroyed.
 */
export const propertiesService = {
  read(id: string): ServerPropertiesReply {
    const instance = serverRepository.getOrThrow(id);
    const dir = resolveSafePath(paths.serverRoot, instance.serverDirectory);
    const file = path.join(dir, PROPERTIES_FILE);
    const relative = relativePropertiesPath(instance.serverDirectory);

    if (!fs.existsSync(file)) {
      return { path: relative, exists: false, text: null, pairs: [] };
    }
    const text = fs.readFileSync(file, "utf8");
    return { path: relative, exists: true, text, pairs: parsePropertiesDoc(text).pairs };
  },

  update(
    id: string,
    changes: { values?: Record<string, string | null>; raw?: string },
  ): ServerPropertiesReply {
    const instance = serverRepository.getOrThrow(id);
    const dir = resolveSafePath(paths.serverRoot, instance.serverDirectory);
    if (!fs.existsSync(dir)) {
      throw new ApiError(
        "SERVER_DIRECTORY_MISSING",
        `Server directory does not exist: ${instance.serverDirectory}.`,
        400,
      );
    }
    const file = path.join(dir, PROPERTIES_FILE);
    const relative = relativePropertiesPath(instance.serverDirectory);

    let next: string;
    if (changes.raw !== undefined) {
      const issues = validatePropertiesText(changes.raw);
      if (issues.length > 0) {
        throw new ApiError("PROPERTIES_INVALID", "Invalid server.properties content.", 400, issues);
      }
      next = changes.raw;
    } else {
      const values = changes.values ?? {};
      const entries = Object.entries(values);
      if (entries.length > MAX_PATCH_KEYS) {
        throw new ApiError("PROPERTIES_TOO_MANY_KEYS", `At most ${MAX_PATCH_KEYS} properties per update.`, 400);
      }
      for (const [key, value] of entries) {
        if (!isValidPropertyKey(key)) {
          throw new ApiError("PROPERTIES_INVALID_KEY", `Invalid property key "${key}".`, 400);
        }
        if (value !== null && (value.includes("\n") || value.includes("\r"))) {
          throw new ApiError("PROPERTIES_INVALID_VALUE", `Property "${key}" must not contain newlines.`, 400);
        }
      }

      const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
      if (existing) {
        next = existing;
        for (const [key, value] of entries) {
          next = value === null ? removeProperty(next, key) : setProperty(next, key, value);
        }
      } else {
        const pairs = entries.filter(([, value]) => value !== null);
        const lines = pairs.map(([key, value]) => `${key}=${value}`);
        next = lines.length > 0 ? `#Minecraft server properties\n${lines.join("\n")}\n` : "";
      }
    }

    fs.writeFileSync(file, next, "utf8");
    return { path: relative, exists: true, text: next, pairs: parsePropertiesDoc(next).pairs };
  },
};