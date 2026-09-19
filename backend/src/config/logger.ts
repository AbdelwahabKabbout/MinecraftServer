import pino from "pino";
import { env } from "../config/index.js";

const configuredLevel = (process.env.LOG_LEVEL ?? "").trim();
const level = configuredLevel !== "" ? configuredLevel : env.NODE_ENV === "test" ? "silent" : "info";

export const logger = pino({
  level,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        }
      : undefined,
});