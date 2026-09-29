import type { RequestHandler } from "express";
import { AppError } from "../../middleware/app-error.js";
import { getBookCover, getBookDetail, searchBooks } from "./books-service.js";
import type { CoverRequest, SearchRequest, WorkRequest } from "./books-schemas.js";

const search: RequestHandler = async (_req, res, next) => {
  try {
    const { q, page } = res.locals.validated.query as SearchRequest;
    res.status(200).json({ data: await searchBooks(q, page) });
  } catch (error) {
    next(error);
  }
};

const detail: RequestHandler = async (_req, res, next) => {
  try {
    const { workId } = res.locals.validated.params as WorkRequest;
    res.status(200).json({ data: await getBookDetail(workId) });
  } catch (error) {
    next(error);
  }
};

const cover: RequestHandler = async (_req, res, next) => {
  try {
    const { coverId } = res.locals.validated.params as CoverRequest;
    const image = await getBookCover(coverId);
    res
      .status(200)
      .set({
        "Content-Type": image.contentType,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      })
      .send(image.body);
  } catch (error) {
    next(error);
  }
};

const rateLimited: RequestHandler = (_req, res, next) => {
  next(
    new AppError(
      429,
      "SEARCH_RATE_LIMITED",
      "Bạn tìm kiếm quá thường xuyên. Vui lòng thử lại sau một phút.",
      [],
      { "Retry-After": res.getHeader("Retry-After")?.toString() ?? "60" },
    ),
  );
};

export const booksController = { search, detail, cover, rateLimited };
