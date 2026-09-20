import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Backend source lives at <repo>/backend/src/config (dev) or <repo>/backend/dist/config (built),
// so three levels up from the config module is always the repository root.
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Load .env from the repository root. Tests set process.env directly before
// importing this module, which takes precedence over the file values.
dotenv.config({ path: path.join(projectRoot, ".env"), override: false });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HTTP_PORT: z.coerce.number().int().positive().default(3000),
  HTTP_HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("file:./data/manager.db"),
  SERVER_ROOT: z.string().default("./servers"),
  JAVA_PATH: z.string().default("java"),
  MEMORY_MIN_MB: z.coerce.number().int().positive().default(1024),
  MEMORY_MAX_MB: z.coerce.number().int().positive().default(2048),
  METRICS_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

export const env = parsed.data;

export function resolveFromProjectRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.join(projectRoot, p);
}

export function resolveDatabasePath(): string {
  const url = env.DATABASE_URL;
  const file = url.startsWith("file:") ? url.slice("file:".length) : url;
  if (file === ":memory:") return file;
  return resolveFromProjectRoot(file);
}

export const paths = {
  projectRoot,
  serverRoot: resolveFromProjectRoot(env.SERVER_ROOT),
  database: resolveDatabasePath(),
};