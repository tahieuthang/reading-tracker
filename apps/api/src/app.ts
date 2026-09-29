import { randomUUID } from "node:crypto";
import express from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { booksRouter, coversRouter } from "./modules/books/books-routes.js";
import { healthRouter } from "./modules/health/health-routes.js";
import { shelfRouter } from "./modules/shelf/shelf-routes.js";

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
app.use("/api/books", booksRouter);
app.use("/api/covers", coversRouter);
app.use("/api/shelf", shelfRouter);
app.use("/api/health", healthRouter);

app.use(notFoundHandler);
app.use(errorHandler);
