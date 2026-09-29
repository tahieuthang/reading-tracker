import type { RequestHandler } from "express";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/app-error.js";

export const healthController: RequestHandler = async (_req, res, next) => {
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
};
