import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/app-error.js";
import { openLibraryClient } from "./open-library-client.js";
import type {
  BookDetail,
  BookEdition,
  BookSearchItem,
  OpenLibraryEdition,
  OpenLibrarySearchDocument,
} from "./types.js";

const WORK_ID_PATTERN = /^OL\d+W$/;
const EDITION_ID_PATTERN = /^OL\d+M$/;
const AUTHOR_ID_PATTERN = /^OL\d+A$/;

function workIdFromKey(key: string): string | null {
  const match = key.match(/\/works\/(OL\d+W)$/);
  return match?.[1] ?? null;
}

function editionFromRecord(edition: OpenLibraryEdition): BookEdition | null {
  const editionId = edition.key?.match(/\/books\/(OL\d+M)$/)?.[1];
  if (!editionId || !EDITION_ID_PATTERN.test(editionId)) return null;

  return {
    editionId,
    title: edition.title?.trim() || "Không rõ tên ấn bản",
    publishDate: edition.publish_date?.trim() || null,
    numberOfPages:
      Number.isInteger(edition.number_of_pages) && Number(edition.number_of_pages) > 0
        ? Number(edition.number_of_pages)
        : null,
    coverId: edition.covers?.find((coverId) => Number.isInteger(coverId) && coverId > 0) ?? null,
  };
}

function publishYear(value: string | undefined): number | null {
  const year = value?.match(/(?:^|\D)(\d{4})(?:\D|$)/)?.[1];
  return year ? Number(year) : null;
}

function normalizedDescription(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "value" in value) {
    const description = value.value;
    return typeof description === "string" ? description.trim() || null : null;
  }
  return null;
}

function coverUrl(coverId: number | null): string | null {
  return coverId ? `/api/covers/${coverId}` : null;
}

function normalizedSearchItem(doc: OpenLibrarySearchDocument): BookSearchItem | null {
  const workId = typeof doc.key === "string" ? workIdFromKey(doc.key) : null;
  if (!workId || !doc.title?.trim()) return null;

  const coverId =
    Number.isInteger(doc.cover_i) && Number(doc.cover_i) > 0 ? Number(doc.cover_i) : null;
  return {
    workId,
    title: doc.title.trim(),
    authors: Array.isArray(doc.author_name)
      ? doc.author_name.filter((author): author is string => typeof author === "string").slice(0, 8)
      : [],
    firstPublishYear:
      Number.isInteger(doc.first_publish_year) && Number(doc.first_publish_year) > 0
        ? Number(doc.first_publish_year)
        : null,
    coverId,
    coverUrl: coverUrl(coverId),
    inShelf: false,
    hasArchivedProgress: false,
  };
}

async function attachShelfFlags(items: BookSearchItem[]): Promise<BookSearchItem[]> {
  const workIds = items.map((item) => item.workId);
  if (workIds.length === 0) return items;

  const shelfItems = await prisma.shelfBook.findMany({
    where: { workId: { in: workIds } },
    select: { workId: true, deletedAt: true },
  });
  const byWorkId = new Map(shelfItems.map((item) => [item.workId, item.deletedAt]));

  return items.map((item) => {
    const deletedAt = byWorkId.get(item.workId);
    const exists = byWorkId.has(item.workId);
    return {
      ...item,
      inShelf: exists && deletedAt === null,
      hasArchivedProgress: exists && deletedAt !== null,
    };
  });
}

export async function searchBooks(query: string, page: number) {
  const result = await openLibraryClient.search(query, page);
  const items = result.docs
    .map(normalizedSearchItem)
    .filter((item): item is BookSearchItem => item !== null);
  const itemsWithShelfFlags = await attachShelfFlags(items);

  return {
    items: itemsWithShelfFlags,
    total: result.numFound ?? result.num_found ?? items.length,
    page,
    pageSize: 20,
  };
}

export async function getBookDetail(workId: string): Promise<BookDetail> {
  const work = await openLibraryClient.getWork(workId);
  if (!work.title?.trim()) {
    throw new AppError(502, "UPSTREAM_INVALID_RESPONSE", "Open Library không trả về tên tác phẩm.");
  }

  const authorIds = (work.authors ?? [])
    .map((reference) => reference.author?.key?.match(/\/authors\/(OL\d+A)$/)?.[1])
    .filter((authorId): authorId is string => Boolean(authorId && AUTHOR_ID_PATTERN.test(authorId)))
    .slice(0, 8);

  const [editionResult, authorResults] = await Promise.all([
    openLibraryClient
      .getEditions(workId)
      .then((value) => ({ value }))
      .catch((error: unknown) => ({ error })),
    Promise.allSettled(authorIds.map((authorId) => openLibraryClient.getAuthor(authorId))),
  ]);
  let editionRecords: OpenLibraryEdition[] = [];
  if ("value" in editionResult) {
    editionRecords = editionResult.value.entries ?? [];
  } else if (!(editionResult.error instanceof AppError && editionResult.error.statusCode === 404)) {
    throw editionResult.error;
  }
  const nonNotFoundAuthorError = authorResults.find(
    (result) =>
      result.status === "rejected" &&
      !(result.reason instanceof AppError && result.reason.statusCode === 404),
  );
  if (nonNotFoundAuthorError?.status === "rejected") {
    throw nonNotFoundAuthorError.reason;
  }

  const editions = editionRecords
    .map(editionFromRecord)
    .filter((edition): edition is BookEdition => edition !== null)
    .slice(0, 50);
  const authors = authorResults.flatMap((result) =>
    result.status === "fulfilled" && result.value.name?.trim() ? [result.value.name.trim()] : [],
  );

  const coverId =
    work.covers?.find((value) => Number.isInteger(value) && value > 0) ??
    editions.find((edition) => edition.coverId !== null)?.coverId ??
    null;
  const firstPublishYear =
    publishYear(work.first_publish_date) ??
    editions
      .map((edition) => publishYear(edition.publishDate ?? undefined))
      .find((year) => year !== null) ??
    null;

  const shelfItem = await prisma.shelfBook.findUnique({
    where: { workId },
    select: { deletedAt: true },
  });
  const exists = shelfItem !== null;

  return {
    workId,
    title: work.title.trim(),
    authors,
    firstPublishYear,
    coverId,
    coverUrl: coverUrl(coverId),
    description: normalizedDescription(work.description),
    subjects: Array.isArray(work.subjects)
      ? [
          ...new Set(
            work.subjects.filter((subject): subject is string => typeof subject === "string"),
          ),
        ].slice(0, 50)
      : [],
    editions,
    inShelf: exists && shelfItem.deletedAt === null,
    hasArchivedProgress: exists && shelfItem.deletedAt !== null,
  };
}

export async function getBookCover(coverId: number) {
  return openLibraryClient.getCover(coverId);
}

export const openLibraryWorkIdPattern = WORK_ID_PATTERN;
