import { env } from "../../config/env.js";
import { AppError } from "../../middleware/app-error.js";
import { z } from "zod";
import type {
  OpenLibraryAuthor,
  OpenLibraryEditionsResponse,
  OpenLibrarySearchResponse,
  OpenLibraryWork,
} from "./types.js";

const OPEN_LIBRARY_BASE_URL = "https://openlibrary.org";
const COVERS_BASE_URL = "https://covers.openlibrary.org";
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_CACHE_ENTRIES = 200;

const searchResponseSchema = z
  .object({
    docs: z.array(
      z
        .object({
          key: z.string(),
          title: z.string().optional(),
          author_name: z.array(z.string()).optional(),
          first_publish_year: z.number().int().optional(),
          cover_i: z.number().int().optional(),
          number_of_pages_median: z.number().int().optional(),
        })
        .passthrough(),
    ),
    numFound: z.number().optional(),
    num_found: z.number().optional(),
  })
  .passthrough();

const workSchema = z
  .object({
    title: z.string().optional(),
    description: z
      .union([z.string(), z.object({ value: z.string().optional() }).passthrough()])
      .optional(),
    covers: z.array(z.number().int()).optional(),
    subjects: z.array(z.string()).optional(),
    authors: z
      .array(
        z.object({ author: z.object({ key: z.string().optional() }).optional() }).passthrough(),
      )
      .optional(),
    first_publish_date: z.string().optional(),
  })
  .passthrough();

const editionsSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            key: z.string().optional(),
            title: z.string().optional(),
            publish_date: z.string().optional(),
            number_of_pages: z.number().int().optional(),
            covers: z.array(z.number().int()).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const authorSchema = z.object({ name: z.string().optional() }).passthrough();

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const responseCache = new Map<string, CacheEntry>();

function upstreamError(status: number): AppError {
  if (status === 429 || status === 503 || status >= 500) {
    return new AppError(
      503,
      "UPSTREAM_UNAVAILABLE",
      "Open Library hiện không khả dụng. Vui lòng thử lại sau.",
      [],
      { "Retry-After": "30" },
    );
  }

  return new AppError(502, "UPSTREAM_ERROR", "Open Library trả về phản hồi không hợp lệ.");
}

function cacheGet<T>(key: string): T | undefined {
  const entry = responseCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return undefined;
  }

  // Cache entries are written only by getJson for the same URL key.
  return entry.value as T;
}

function cacheSet(key: string, value: unknown, ttlMs: number): void {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

async function getJson<T>(url: URL, ttlMs: number, notFoundMessage: string): Promise<T> {
  const cacheKey = url.toString();
  const cached = cacheGet<T>(cacheKey);
  if (cached !== undefined) return cached;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": env.OPEN_LIBRARY_USER_AGENT,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new AppError(504, "UPSTREAM_TIMEOUT", "Open Library tardó demasiado en responder.");
    }
    throw new AppError(502, "UPSTREAM_ERROR", "No se pudo conectar con Open Library.");
  }

  if (response.status === 404) {
    throw new AppError(404, "BOOK_NOT_FOUND", notFoundMessage);
  }
  if (!response.ok) throw upstreamError(response.status);

  let value: T;
  try {
    value = (await response.json()) as T;
  } catch {
    throw new AppError(502, "UPSTREAM_INVALID_RESPONSE", "Open Library trả về JSON không hợp lệ.");
  }

  cacheSet(cacheKey, value, ttlMs);
  return value;
}

export class OpenLibraryClient {
  async search(query: string, page: number): Promise<OpenLibrarySearchResponse> {
    const url = new URL("/search.json", OPEN_LIBRARY_BASE_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", "20");
    url.searchParams.set(
      "fields",
      "key,title,author_name,first_publish_year,cover_i,number_of_pages_median",
    );

    const value = await getJson<unknown>(url, 60_000, "Không tìm thấy sách.");
    const parsed = searchResponseSchema.safeParse(value);
    if (!parsed.success) {
      throw new AppError(
        502,
        "UPSTREAM_INVALID_RESPONSE",
        "Open Library trả về dữ liệu tìm kiếm không hợp lệ.",
      );
    }
    return parsed.data satisfies OpenLibrarySearchResponse;
  }

  async getWork(workId: string): Promise<OpenLibraryWork> {
    const url = new URL(`/works/${workId}.json`, OPEN_LIBRARY_BASE_URL);
    const value = await getJson<unknown>(url, 300_000, "Không tìm thấy tác phẩm.");
    const parsed = workSchema.safeParse(value);
    if (!parsed.success) {
      throw new AppError(
        502,
        "UPSTREAM_INVALID_RESPONSE",
        "Open Library trả về dữ liệu tác phẩm không hợp lệ.",
      );
    }
    return parsed.data satisfies OpenLibraryWork;
  }

  async getEditions(workId: string): Promise<OpenLibraryEditionsResponse> {
    const url = new URL(`/works/${workId}/editions.json`, OPEN_LIBRARY_BASE_URL);
    url.searchParams.set("limit", "50");
    const value = await getJson<unknown>(url, 300_000, "Không tìm thấy ấn bản.");
    const parsed = editionsSchema.safeParse(value);
    if (!parsed.success) {
      throw new AppError(
        502,
        "UPSTREAM_INVALID_RESPONSE",
        "Open Library trả về danh sách ấn bản không hợp lệ.",
      );
    }
    return parsed.data satisfies OpenLibraryEditionsResponse;
  }

  async getAuthor(authorId: string): Promise<OpenLibraryAuthor> {
    const url = new URL(`/authors/${authorId}.json`, OPEN_LIBRARY_BASE_URL);
    const value = await getJson<unknown>(url, 300_000, "Không tìm thấy tác giả.");
    const parsed = authorSchema.safeParse(value);
    if (!parsed.success) {
      throw new AppError(
        502,
        "UPSTREAM_INVALID_RESPONSE",
        "Open Library trả về dữ liệu tác giả không hợp lệ.",
      );
    }
    return parsed.data satisfies OpenLibraryAuthor;
  }

  async getCover(coverId: number): Promise<{ body: Buffer; contentType: string }> {
    const url = new URL(`/b/id/${coverId}-M.jpg`, COVERS_BASE_URL);
    url.searchParams.set("default", "false");

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": env.OPEN_LIBRARY_USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new AppError(504, "UPSTREAM_TIMEOUT", "Open Library tardó demasiado en responder.");
      }
      throw new AppError(502, "UPSTREAM_ERROR", "No se pudo cargar la imagen de portada.");
    }

    if (response.status === 404) {
      throw new AppError(404, "COVER_NOT_FOUND", "Không tìm thấy ảnh bìa.");
    }
    if (!response.ok) throw upstreamError(response.status);

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      throw new AppError(
        502,
        "UPSTREAM_INVALID_RESPONSE",
        "Open Library trả về dữ liệu ảnh không hợp lệ.",
      );
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 5_000_000) {
      throw new AppError(
        502,
        "UPSTREAM_RESPONSE_TOO_LARGE",
        "Ảnh bìa trả về vượt quá kích thước cho phép.",
      );
    }
    let body: Buffer;
    try {
      body = Buffer.from(await response.arrayBuffer());
    } catch {
      throw new AppError(502, "UPSTREAM_INVALID_RESPONSE", "Không thể đọc dữ liệu ảnh bìa.");
    }
    if (body.byteLength === 0 || body.byteLength > 5_000_000) {
      throw new AppError(502, "UPSTREAM_INVALID_RESPONSE", "Ảnh bìa trả về không hợp lệ.");
    }
    return { body, contentType };
  }
}

export const openLibraryClient = new OpenLibraryClient();
