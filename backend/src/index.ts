import { env } from "./config/index.js";
import { logger } from "./config/logger.js";
import { runMigrations } from "./db/migrate.js";
import { buildApp } from "./server.js";

async function main(): Promise<void> {
  const applied = runMigrations();
  if (applied > 0) logger.info({ applied }, "Database migrations applied at startup");

  const app = await buildApp();
  const port = env.HTTP_PORT;
  const host = env.HTTP_HOST;

  await app.listen({ port, host });

  const address = app.server.address();
  const shown = typeof address === "object" && address ? `${address.address}:${address.port}` : `${host}:${port}`;
  logger.info(`Minecraft Server Manager API listening on http://${shown}`);
}

main().catch((error) => {
  logger.error(error, "Fatal error during startup");
  process.exit(1);
});