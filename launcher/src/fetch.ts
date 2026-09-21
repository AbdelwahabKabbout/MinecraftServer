import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface DownloadResult {
  ok: boolean;
  error?: string;
}

/** Downloads a URL to a destination file, never following redirects to non-http(s) schemes. */
export async function downloadTo(url: string, destination: string): Promise<DownloadResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: `Invalid URL: ${url}` };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: `Unsupported protocol '${parsed.protocol}' for ${url}` };
  }

  try {
    const response = await fetch(parsed, { redirect: "follow" });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} for ${url}` };
    }
    if (!response.body) {
      return { ok: false, error: `Empty response body for ${url}` };
    }
    await mkdir(path.dirname(destination), { recursive: true });
    const temp = `${destination}.part`;
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temp));
    await import("node:fs/promises").then((fs) => fs.rename(temp, destination));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}