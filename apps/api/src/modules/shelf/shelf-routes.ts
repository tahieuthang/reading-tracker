import { Router } from "express";
import { z } from "zod";
import { validateRequest } from "../../middleware/validate-request.js";
import {
  addShelfBook,
  getShelfStats,
  listShelfBooks,
  removeShelfBook,
  updateShelfBook,
} from "./shelf-service.js";

const shelfStatusSchema = z.enum(["WANT_TO_READ", "READING", "READ"]);

const listRequestSchema = z.object({
  query: z.object({ status: shelfStatusSchema.optional() }),
});

const addRequestSchema = z.object({
  body: z.object({
    workId: z.string().regex(/^OL\d+W$/, "Mã tác phẩm không hợp lệ."),
    status: shelfStatusSchema.default("WANT_TO_READ"),
    editionId: z
      .string()
      .regex(/^OL\d+M$/, "Mã ấn bản không hợp lệ.")
      .optional(),
    totalPages: z.number().int().positive().nullable().optional(),
  }),
});

const updateRequestSchema = z.object({
  params: z.object({ id: z.string().uuid("Mã sách trong tủ không hợp lệ.") }),
  body: z
    .object({
      status: shelfStatusSchema.optional(),
      totalPages: z.number().int().positive().nullable().optional(),
      currentPage: z.number().int().min(0).optional(),
      rating: z.number().int().min(1).max(5).nullable().optional(),
      note: z.string().max(1000).nullable().optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, "Cần có ít nhất một trường để cập nhật."),
});

const idRequestSchema = z.object({
  params: z.object({ id: z.string().uuid("Mã sách trong tủ không hợp lệ.") }),
});

type ListRequest = z.infer<typeof listRequestSchema>["query"];
type AddRequest = z.infer<typeof addRequestSchema>["body"];
type UpdateRequest = z.infer<typeof updateRequestSchema>;
type IdRequest = z.infer<typeof idRequestSchema>["params"];

export const shelfRouter = Router();

shelfRouter.get("/stats", async (_req, res, next) => {
  try {
    res.status(200).json({ data: await getShelfStats() });
  } catch (error) {
    next(error);
  }
});

shelfRouter.get("/", validateRequest(listRequestSchema), async (_req, res, next) => {
  try {
    const { status } = res.locals.validated.query as ListRequest;
    res.status(200).json({ data: await listShelfBooks(status) });
  } catch (error) {
    next(error);
  }
});

shelfRouter.post("/", validateRequest(addRequestSchema), async (_req, res, next) => {
  try {
    const result = await addShelfBook(res.locals.validated.body as AddRequest);
    res.status(result.restored ? 200 : 201).json({ data: result });
  } catch (error) {
    next(error);
  }
});

shelfRouter.patch("/:id", validateRequest(updateRequestSchema), async (_req, res, next) => {
  try {
    const validated = res.locals.validated as UpdateRequest;
    const book = await updateShelfBook(validated.params.id, validated.body);
    res.status(200).json({ data: book });
  } catch (error) {
    next(error);
  }
});

shelfRouter.delete("/:id", validateRequest(idRequestSchema), async (_req, res, next) => {
  try {
    const { id } = res.locals.validated.params as IdRequest;
    await removeShelfBook(id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
