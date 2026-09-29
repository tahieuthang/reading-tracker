import { z } from "zod";

export const openLibraryWorkIdPattern = /^OL\d+W$/;

export const searchRequestSchema = z.object({
  query: z.object({
    q: z.string().trim().min(2, "Nhập ít nhất 2 ký tự để tìm sách.").max(200),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  }),
});

export const workRequestSchema = z.object({
  params: z.object({
    workId: z.string().regex(openLibraryWorkIdPattern, "Mã tác phẩm không hợp lệ."),
  }),
});

export const coverRequestSchema = z.object({
  params: z.object({ coverId: z.coerce.number().int().min(1).max(2_147_483_647) }),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>["query"];
export type WorkRequest = z.infer<typeof workRequestSchema>["params"];
export type CoverRequest = z.infer<typeof coverRequestSchema>["params"];
