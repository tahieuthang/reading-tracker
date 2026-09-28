import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "./app-error.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, "RESOURCE_NOT_FOUND", `Không tìm thấy ${req.method} ${req.path}.`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  const isMalformedJson = error instanceof SyntaxError && "status" in error && error.status === 400;
  const appError =
    error instanceof AppError
      ? error
      : error instanceof ZodError
        ? new AppError(
            400,
            "VALIDATION_ERROR",
            "Dữ liệu đầu vào không hợp lệ.",
            error.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            })),
          )
        : isMalformedJson
          ? new AppError(400, "INVALID_JSON", "Nội dung JSON không hợp lệ.")
          : undefined;

  const statusCode = appError?.statusCode ?? 500;
  const code = appError?.code ?? "INTERNAL_ERROR";
  const message = appError?.message ?? "Đã xảy ra lỗi nội bộ.";
  const details = appError?.details ?? [];

  if (statusCode >= 500) {
    req.log?.error({ err: error, requestId: req.id }, "Request failed");
  } else {
    req.log?.warn({ code, requestId: req.id }, "Request rejected");
  }

  if (appError) {
    for (const [name, value] of Object.entries(appError.headers)) {
      res.setHeader(name, value);
    }
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      details,
      requestId: req.id,
    },
  });
};
