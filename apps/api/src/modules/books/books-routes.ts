import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { validateRequest } from "../../middleware/validate-request.js";
import { booksController } from "./books-controller.js";
import { coverRequestSchema, searchRequestSchema, workRequestSchema } from "./books-schemas.js";

export const booksRouter = Router();
export const coversRouter = Router();

const searchRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: booksController.rateLimited,
});

booksRouter.get("/", searchRateLimit, validateRequest(searchRequestSchema), booksController.search);
booksRouter.get("/:workId", validateRequest(workRequestSchema), booksController.detail);
coversRouter.get("/:coverId", validateRequest(coverRequestSchema), booksController.cover);
