import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { AppError } from "./app-error.js";

export function validateRequest(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      next(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Dữ liệu đầu vào không hợp lệ.",
          result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        ),
      );
      return;
    }

    res.locals.validated = result.data;
    next();
  };
}
