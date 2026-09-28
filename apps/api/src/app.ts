import { randomUUID } from "node:crypto";
import express from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { AppError } from "./middleware/app-error.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

export const app = express();

app.disable("x-powered-by");
app.use(
  pinoHttp({
    logger,
    genReqId: () => randomUUID(),
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  }),
);
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      data: {
        status: "ok",
        database: "ok",
      },
    });
  } catch {
    next(new AppError(503, "DATABASE_UNAVAILABLE", "Cơ sở dữ liệu hiện không khả dụng."));
  }
});

app.use(notFoundHandler);
app.use(errorHandler);
