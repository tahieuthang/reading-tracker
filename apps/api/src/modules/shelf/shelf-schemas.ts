import { z } from "zod";

const shelfStatusSchema = z.enum(["WANT_TO_READ", "READING", "READ"]);

export const listRequestSchema = z.object({
  query: z.object({ status: shelfStatusSchema.optional() }),
});

export const addRequestSchema = z.object({
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

export const updateRequestSchema = z.object({
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

export const idRequestSchema = z.object({
  params: z.object({ id: z.string().uuid("Mã sách trong tủ không hợp lệ.") }),
});

export type ListRequest = z.infer<typeof listRequestSchema>["query"];
export type AddRequest = z.infer<typeof addRequestSchema>["body"];
export type UpdateRequest = z.infer<typeof updateRequestSchema>;
export type IdRequest = z.infer<typeof idRequestSchema>["params"];
