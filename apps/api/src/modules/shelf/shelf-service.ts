import type { PageCountSource, ShelfBook, ShelfStatus } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/app-error.js";
import { getBookDetail } from "../books/books-service.js";
import { shelfRepository } from "./shelf-repository.js";
import { buildInitialReadingState, buildShelfUpdate, type ShelfPatch } from "./shelf-rules.js";

export interface AddShelfBookInput {
  workId: string;
  status: ShelfStatus;
  editionId?: string;
  totalPages?: number | null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toShelfBookDto(book: ShelfBook) {
  return {
    id: book.id,
    workId: book.workId,
    editionId: book.editionId,
    title: book.title,
    authors: stringArray(book.authors),
    coverId: book.coverId,
    coverUrl: book.coverId === null ? null : `/api/covers/${book.coverId}`,
    firstPublishYear: book.firstPublishYear,
    description: book.description,
    subjects: stringArray(book.subjects),
    totalPages: book.totalPages,
    pageCountSource: book.pageCountSource,
    currentPage: book.currentPage,
    progressPercent:
      book.totalPages === null ? null : Math.round((book.currentPage / book.totalPages) * 100),
    status: book.status,
    rating: book.rating,
    note: book.note,
    startedAt: book.startedAt,
    finishedAt: book.finishedAt,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}

function notFound(): AppError {
  return new AppError(404, "SHELF_ITEM_NOT_FOUND", "Không tìm thấy sách trong tủ.");
}

function alreadyInShelf(): AppError {
  return new AppError(409, "BOOK_ALREADY_IN_SHELF", "Sách này đã có trong tủ sách.");
}

export async function listShelfBooks(status?: ShelfStatus) {
  const books = await shelfRepository.listActive(status);
  return { items: books.map(toShelfBookDto) };
}

export function getShelfStats() {
  return shelfRepository.getActiveStats();
}

export async function addShelfBook(input: AddShelfBookInput) {
  const existing = await shelfRepository.findByWorkId(input.workId);
  if (existing?.deletedAt === null) throw alreadyInShelf();

  if (existing?.deletedAt !== null && existing !== null) {
    const restored = await shelfRepository.restoreDeletedByWorkId(input.workId);
    if (restored) return { book: toShelfBookDto(restored), restored: true };

    const latest = await shelfRepository.findByWorkId(input.workId);
    if (latest?.deletedAt === null) throw alreadyInShelf();
  }

  const metadata = await getBookDetail(input.workId);
  const selectedEdition = input.editionId
    ? metadata.editions.find((edition) => edition.editionId === input.editionId)
    : undefined;
  if (input.editionId && !selectedEdition) {
    throw new AppError(
      422,
      "EDITION_NOT_AVAILABLE",
      "Ấn bản đã chọn không thuộc danh sách ấn bản của tác phẩm này.",
      [{ field: "editionId", message: "Chọn một ấn bản trong danh sách chi tiết sách." }],
    );
  }

  const totalPages = input.totalPages ?? selectedEdition?.numberOfPages ?? null;
  const pageCountSource: PageCountSource | null =
    input.totalPages !== undefined && input.totalPages !== null
      ? "MANUAL"
      : selectedEdition?.numberOfPages
        ? "EDITION"
        : null;
  const initialState = buildInitialReadingState(input.status, totalPages);

  try {
    const result = await shelfRepository.createOrRestore({
      workId: metadata.workId,
      editionId: input.editionId ?? null,
      title: metadata.title,
      authors: metadata.authors,
      coverId: metadata.coverId,
      firstPublishYear: metadata.firstPublishYear,
      description: metadata.description,
      subjects: metadata.subjects,
      totalPages,
      pageCountSource,
      currentPage: initialState.currentPage,
      status: initialState.status,
      rating: null,
      note: null,
      startedAt: initialState.startedAt,
      finishedAt: initialState.finishedAt,
    });

    if (result.kind === "already-active") throw alreadyInShelf();
    return { book: toShelfBookDto(result.book), restored: result.kind === "restored" };
  } catch (error) {
    if (isUniqueConstraintError(error)) throw alreadyInShelf();
    throw error;
  }
}

export async function updateShelfBook(id: string, patch: ShelfPatch) {
  const current = await shelfRepository.findActiveById(id);
  if (!current) throw notFound();

  const update = buildShelfUpdate(current, patch);
  const book = await shelfRepository.updateActiveById(id, update);
  if (!book) throw notFound();
  return toShelfBookDto(book);
}

export async function removeShelfBook(id: string): Promise<void> {
  const deleted = await shelfRepository.softDeleteActiveById(id, new Date());
  if (!deleted) throw notFound();
}

export const shelfStatuses: ShelfStatus[] = ["WANT_TO_READ", "READING", "READ"];
