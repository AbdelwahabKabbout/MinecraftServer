import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { ApiError } from "../utils/api.js";
import { logger } from "../config/logger.js";

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

function errorBody(code: string, message: string, details?: unknown): ErrorBody {
  return { success: false, error: details === undefined ? { code, message } : { code, message, details } };
}

export function buildErrorHandler() {
  return async function errorHandler(err: Error, request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (err instanceof ApiError) {
      const body = errorBody(err.code, err.message, err.details);
      request.log.warn({ code: err.code }, err.message);
      await reply.status(err.statusCode).send(body);
      return;
    }

    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      request.log.warn({ details }, "Request validation failed");
      await reply.status(400).send(errorBody("VALIDATION_ERROR", "Request validation failed", details));
      return;
    }

    const status = typeof (err as unknown as { statusCode?: number }).statusCode === "number"
      ? (err as unknown as { statusCode: number }).statusCode
      : 500;

    if (status >= 400 && status < 500) {
      await reply.status(status).send(errorBody("BAD_REQUEST", err.message));
      return;
    }

    request.log.error(err, "Unhandled error");
    await reply.status(500).send(errorBody("INTERNAL_ERROR", "An unexpected error occurred. Check the backend logs for details."));
  };
}