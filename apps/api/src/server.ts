import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const server = app.listen(env.PORT, "0.0.0.0", () => {
  logger.info({ port: env.PORT }, "Reading Tracker API started");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down API");
  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, "Failed to close HTTP server");
      process.exitCode = 1;
    }

    await prisma.$disconnect();
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
