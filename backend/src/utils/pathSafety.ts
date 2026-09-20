import path from "node:path";
import { ApiError } from "./api.js";

export const RESERVED_DIR_NAMES = new Set(["", ".", ".."]);

/**
 * Validates that `relative` is a safe relative sub-path (no absolute paths,
 * no traversal, no drive letters, no NUL bytes) and returns the resolved
 * absolute path underneath `root`.
 */
export function resolveSafePath(root: string, relative: string): string {
  if (typeof relative !== "string" || relative.trim() === "") {
    throw new ApiError("INVALID_PATH", "Server directory must not be empty.", 400);
  }
  if (relative.includes("\0")) {
    throw new ApiError("INVALID_PATH", "Server directory contains invalid characters.", 400);
  }
  if (path.isAbsolute(relative)) {
    throw new ApiError("INVALID_PATH", "Server directory must be relative to the servers root, not an absolute path.", 400);
  }

  const normalized = path.normalize(relative);
  const parts = normalized.split(/[\\/]+/).filter((p) => p !== "" && p !== ".");
  if (parts.length === 0 || parts.some((p) => p === ".." || isWindowsDrive(p))) {
    throw new ApiError("INVALID_PATH", "Server directory escapes the servers root.", 400);
  }

  const resolved = path.resolve(root, normalized);
  const rootWithSep = path.resolve(root).endsWith(path.sep)
    ? path.resolve(root)
    : `${path.resolve(root)}${path.sep}`;

  if (!resolved.startsWith(rootWithSep) && resolved !== path.resolve(root)) {
    throw new ApiError("INVALID_PATH", "Server directory escapes the servers root.", 400);
  }

  return resolved;
}

function isWindowsDrive(part: string): boolean {
  return /^[a-zA-Z]:/.test(part);
}