import type { PageCountSource, ShelfStatus } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/app-error.js";

export interface ShelfState {
  status: ShelfStatus;
  totalPages: number | null;
  currentPage: number;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface ShelfPatch {
  status?: ShelfStatus;
  totalPages?: number | null;
  currentPage?: number;
  rating?: number | null;
  note?: string | null;
}

export interface ShelfUpdate {
  status: ShelfStatus;
  totalPages: number | null;
  pageCountSource?: PageCountSource | null;
  currentPage: number;
  rating?: number | null;
  note?: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

function pageOutOfRange(currentPage: number, totalPages: number): AppError {
  return new AppError(
    422,
    "PAGE_OUT_OF_RANGE",
    "Số trang hiện tại phải nằm trong khoảng từ 0 đến tổng số trang.",
    [{ field: "currentPage", message: `Không được lớn hơn totalPages (${totalPages}).` }],
  );
}

function pageCountRequired(): AppError {
  return new AppError(
    422,
    "TOTAL_PAGES_REQUIRED",
    "Cần có tổng số trang trước khi cập nhật trang đang đọc.",
    [{ field: "totalPages", message: "Hãy nhập tổng số trang của sách." }],
  );
}

function readingPageRequired(): AppError {
  return new AppError(
    422,
    "INVALID_STATUS_TRANSITION",
    "Để chuyển sang Đang đọc, trang hiện tại phải nhỏ hơn tổng số trang.",
    [{ field: "currentPage", message: "Gửi currentPage nhỏ hơn totalPages trong cùng request." }],
  );
}

export function buildShelfUpdate(
  current: ShelfState,
  patch: ShelfPatch,
  now = new Date(),
): ShelfUpdate {
  const totalPages = patch.totalPages !== undefined ? patch.totalPages : current.totalPages;
  let currentPage = patch.currentPage ?? current.currentPage;
  let status = patch.status ?? current.status;
  let startedAt = current.startedAt;
  let finishedAt = current.finishedAt;

  const update: ShelfUpdate = {
    status,
    totalPages,
    currentPage,
    startedAt,
    finishedAt,
  };

  if (patch.totalPages !== undefined) {
    update.pageCountSource = totalPages === null ? null : "MANUAL";
  }
  if (patch.rating !== undefined) update.rating = patch.rating;
  if (patch.note !== undefined) update.note = patch.note;

  if (patch.status === "WANT_TO_READ") {
    return {
      ...update,
      status: "WANT_TO_READ",
      currentPage: 0,
      startedAt: null,
      finishedAt: null,
    };
  }

  if (
    current.status === "READ" &&
    current.totalPages === null &&
    totalPages !== null &&
    patch.currentPage === undefined
  ) {
    if (patch.status === "READING") throw readingPageRequired();
    currentPage = totalPages;
    status = "READ";
  }

  if (totalPages === null && currentPage > 0) throw pageCountRequired();
  if (totalPages !== null && currentPage > totalPages)
    throw pageOutOfRange(currentPage, totalPages);

  if (patch.status === "READ") {
    currentPage = totalPages ?? 0;
    status = "READ";
    if (current.status !== "READ" || current.finishedAt === null) finishedAt = now;
  } else if (patch.status === "READING") {
    if (totalPages !== null && currentPage === totalPages) throw readingPageRequired();
    status = "READING";
    if (startedAt === null) startedAt = now;
    finishedAt = null;
  } else if (totalPages !== null && currentPage === totalPages) {
    status = "READ";
    if (current.status !== "READ" || current.finishedAt === null) finishedAt = now;
  } else if (
    current.status === "READ" &&
    (patch.currentPage !== undefined || patch.totalPages !== undefined)
  ) {
    status = "READING";
    if (startedAt === null) startedAt = now;
    finishedAt = null;
  } else if (status === "READING" && startedAt === null) {
    startedAt = now;
  }

  return {
    ...update,
    status,
    currentPage,
    startedAt,
    finishedAt,
  };
}

export function buildInitialReadingState(
  status: ShelfStatus,
  totalPages: number | null,
  now = new Date(),
): Pick<ShelfUpdate, "status" | "currentPage" | "startedAt" | "finishedAt"> {
  if (status === "READ") {
    return { status, currentPage: totalPages ?? 0, startedAt: null, finishedAt: now };
  }
  if (status === "READING") {
    return { status, currentPage: 0, startedAt: now, finishedAt: null };
  }
  return { status: "WANT_TO_READ", currentPage: 0, startedAt: null, finishedAt: null };
}
