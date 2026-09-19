import type { Config } from "drizzle-kit";

const databaseUrl: string = process.env.DATABASE_URL ?? "file:./data/manager.db";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
} satisfies Config;