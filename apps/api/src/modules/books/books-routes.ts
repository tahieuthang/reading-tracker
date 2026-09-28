import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { AppError } from "../../middleware/app-error.js";
import { validateRequest } from "../../middleware/validate-request.js";
import {
  getBookCover,
  getBookDetail,
  openLibraryWorkIdPattern,
  searchBooks,
} from "./books-service.js";

const searchRequestSchema = z.object({
  query: z.object({
    q: z.string().trim().min(2, "Nhập ít nhất 2 ký tự để tìm sách.").max(200),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  }),
});

const workRequestSchema = z.object({
  params: z.object({
    workId: z.string().regex(openLibraryWorkIdPattern, "Mã tác phẩm không hợp lệ."),
  }),
});

const coverRequestSchema = z.object({
  params: z.object({ coverId: z.coerce.number().int().min(1).max(2_147_483_647) }),
});

type SearchRequest = z.infer<typeof searchRequestSchema>["query"];
type WorkRequest = z.infer<typeof workRequestSchema>["params"];
type CoverRequest = z.infer<typeof coverRequestSchema>["params"];

export const booksRouter = Router();
export const coversRouter = Router();

const searchRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res, next) => {
    next(
      new AppError(
        429,
        "SEARCH_RATE_LIMITED",
        "Bạn tìm kiếm quá thường xuyên. Vui lòng thử lại sau một phút.",
        [],
        { "Retry-After": res.getHeader("Retry-After")?.toString() ?? "60" },
      ),
    );
  },
});

booksRouter.get(
  "/",
  searchRateLimit,
  validateRequest(searchRequestSchema),
  async (_req, res, next) => {
    try {
      const { q, page } = res.locals.validated.query as SearchRequest;
      res.status(200).json({ data: await searchBooks(q, page) });
    } catch (error) {
      next(error);
    }
  },
);

booksRouter.get("/:workId", validateRequest(workRequestSchema), async (_req, res, next) => {
  try {
    const { workId } = res.locals.validated.params as WorkRequest;
    res.status(200).json({ data: await getBookDetail(workId) });
  } catch (error) {
    next(error);
  }
});

coversRouter.get("/:coverId", validateRequest(coverRequestSchema), async (_req, res, next) => {
  try {
    const { coverId } = res.locals.validated.params as CoverRequest;
    const cover = await getBookCover(coverId);
    res
      .status(200)
      .set({
        "Content-Type": cover.contentType,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      })
      .send(cover.body);
  } catch (error) {
    next(error);
  }
});
