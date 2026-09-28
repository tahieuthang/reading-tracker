export type ShelfStatus = "WANT_TO_READ" | "READING" | "READ";

export interface BookSearchItem {
  workId: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
  coverId: number | null;
  coverUrl: string | null;
  inShelf: boolean;
  hasArchivedProgress: boolean;
}

export interface BookSearchResult {
  items: BookSearchItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BookEdition {
  editionId: string;
  title: string;
  publishDate: string | null;
  numberOfPages: number | null;
  coverId: number | null;
}

export interface BookDetail extends BookSearchItem {
  description: string | null;
  subjects: string[];
  editions: BookEdition[];
}

export interface ShelfBook {
  id: string;
  workId: string;
  editionId: string | null;
  title: string;
  authors: string[];
  coverId: number | null;
  coverUrl: string | null;
  firstPublishYear: number | null;
  description: string | null;
  subjects: string[];
  pageCountSource: "EDITION" | "MANUAL" | null;
  totalPages: number | null;
  currentPage: number;
  progressPercent: number | null;
  status: ShelfStatus;
  rating: number | null;
  note: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShelfStats {
  totalBooks: number;
  readingBooks: number;
  readBooks: number;
}

interface ApiEnvelope<T> {
  data: T;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiRequestError("Không thể kết nối máy chủ. Kiểm tra kết nối rồi thử lại.", 0);
  }

  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as (ApiEnvelope<T> & ApiErrorBody) | null;
  if (!response.ok) {
    throw new ApiRequestError(
      body?.error?.message ?? "Đã xảy ra lỗi. Vui lòng thử lại.",
      response.status,
      body?.error?.code,
    );
  }
  if (!body || !("data" in body))
    throw new ApiRequestError("Máy chủ trả về dữ liệu không hợp lệ.", response.status);
  return body.data;
}

function queryString(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function json(body: unknown, method = "POST"): RequestInit {
  return { method, body: JSON.stringify(body) };
}

export const api = {
  searchBooks: (q: string, page: number) =>
    request<BookSearchResult>(`/api/books${queryString({ q, page })}`),
  getBook: (workId: string) => request<BookDetail>(`/api/books/${encodeURIComponent(workId)}`),
  getShelf: (status?: ShelfStatus) =>
    request<{ items: ShelfBook[] }>(`/api/shelf${queryString({ status })}`).then(
      (result) => result.items,
    ),
  getShelfStats: () => request<ShelfStats>("/api/shelf/stats"),
  addToShelf: (input: {
    workId: string;
    status: ShelfStatus;
    editionId?: string;
    totalPages?: number | null;
  }) => request<{ book: ShelfBook; restored: boolean }>("/api/shelf", json(input)),
  updateShelfBook: (
    id: string,
    input: Partial<Pick<ShelfBook, "status" | "totalPages" | "currentPage" | "rating" | "note">>,
  ) => request<ShelfBook>(`/api/shelf/${encodeURIComponent(id)}`, json(input, "PATCH")),
  removeFromShelf: (id: string) =>
    request<void>(`/api/shelf/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export const statusLabels: Record<ShelfStatus, string> = {
  WANT_TO_READ: "Muốn đọc",
  READING: "Đang đọc",
  READ: "Đã đọc",
};

export const statusOptions: ShelfStatus[] = ["WANT_TO_READ", "READING", "READ"];
