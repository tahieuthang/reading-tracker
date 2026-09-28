import { prisma } from "../../lib/prisma.js";
import type { Prisma, ShelfBook, ShelfStatus } from "../../generated/prisma/client.js";

export interface NewShelfBookRecord {
  workId: string;
  editionId: string | null;
  title: string;
  authors: string[];
  coverId: number | null;
  firstPublishYear: number | null;
  description: string | null;
  subjects: string[];
  totalPages: number | null;
  pageCountSource: "EDITION" | "MANUAL" | null;
  currentPage: number;
  status: ShelfStatus;
  rating: number | null;
  note: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export type CreateOrRestoreResult =
  | { kind: "created"; book: ShelfBook }
  | { kind: "restored"; book: ShelfBook }
  | { kind: "already-active"; book: ShelfBook };

export class ShelfRepository {
  findStatesByWorkIds(workIds: string[]) {
    if (workIds.length === 0) return Promise.resolve([]);
    return prisma.shelfBook.findMany({
      where: { workId: { in: workIds } },
      select: { workId: true, deletedAt: true },
    });
  }

  findByWorkId(workId: string) {
    return prisma.shelfBook.findUnique({ where: { workId } });
  }

  async restoreDeletedByWorkId(workId: string): Promise<ShelfBook | null> {
    return prisma.$transaction(async (transaction) => {
      const result = await transaction.shelfBook.updateMany({
        where: { workId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      if (result.count === 0) return null;
      return transaction.shelfBook.findUnique({ where: { workId } });
    });
  }

  createOrRestore(input: NewShelfBookRecord): Promise<CreateOrRestoreResult> {
    return prisma.$transaction(async (transaction) => {
      const existing = await transaction.shelfBook.findUnique({ where: { workId: input.workId } });
      if (existing?.deletedAt === null) return { kind: "already-active", book: existing };

      if (existing) {
        const book = await transaction.shelfBook.update({
          where: { id: existing.id },
          data: { deletedAt: null },
        });
        return { kind: "restored", book };
      }

      const book = await transaction.shelfBook.create({ data: input });
      return { kind: "created", book };
    });
  }

  listActive(status?: ShelfStatus) {
    return prisma.shelfBook.findMany({
      where: { deletedAt: null, ...(status ? { status } : {}) },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
  }

  async getActiveStats(): Promise<{ totalBooks: number; readingBooks: number; readBooks: number }> {
    const grouped = await prisma.shelfBook.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const counts = new Map(grouped.map((row) => [row.status, row._count._all]));
    const readingBooks = counts.get("READING") ?? 0;
    const readBooks = counts.get("READ") ?? 0;

    return {
      totalBooks: grouped.reduce((sum, row) => sum + row._count._all, 0),
      readingBooks,
      readBooks,
    };
  }

  findActiveById(id: string) {
    return prisma.shelfBook.findFirst({ where: { id, deletedAt: null } });
  }

  updateActiveById(id: string, data: Prisma.ShelfBookUpdateManyMutationInput) {
    return prisma.$transaction(async (transaction) => {
      const result = await transaction.shelfBook.updateMany({
        where: { id, deletedAt: null },
        data,
      });
      if (result.count === 0) return null;
      return transaction.shelfBook.findUnique({ where: { id } });
    });
  }

  async softDeleteActiveById(id: string, deletedAt: Date): Promise<boolean> {
    const result = await prisma.shelfBook.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt },
    });
    return result.count > 0;
  }
}

export const shelfRepository = new ShelfRepository();
