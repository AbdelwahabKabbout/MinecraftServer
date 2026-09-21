import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

export type VerifyResult = "present" | "missing" | "checksum-mismatch";

export async function verifyFile(filePath: string, expectedSha256?: string): Promise<VerifyResult> {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return "missing";
  }
  if (!info.isFile()) return "missing";
  if (!expectedSha256) return "present";
  const digest = await sha256File(filePath);
  return digest.toLowerCase() === expectedSha256.toLowerCase() ? "present" : "checksum-mismatch";
}