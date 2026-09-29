import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../middleware/app-error.js";
import { buildInitialReadingState, buildShelfUpdate, type ShelfState } from "./shelf-rules.js";

const startedAt = new Date("2026-09-01T10:00:00.000Z");
const finishedAt = new Date("2026-09-10T10:00:00.000Z");
const now = new Date("2026-09-28T10:00:00.000Z");

function state(overrides: Partial<ShelfState> = {}): ShelfState {
  return {
    status: "READING",
    totalPages: 100,
    currentPage: 3,
    startedAt,
    finishedAt: null,
    ...overrides,
  };
}

test("allows jumping directly to another valid page", () => {
  const update = buildShelfUpdate(state(), { currentPage: 90 }, now);

  assert.equal(update.currentPage, 90);
  assert.equal(update.status, "READING");
  assert.equal(update.startedAt, startedAt);
});

test("automatically starts reading when a want-to-read book advances to a partial page", () => {
  const update = buildShelfUpdate(
    state({ status: "WANT_TO_READ", currentPage: 0, startedAt: null }),
    { currentPage: 5 },
    now,
  );

  assert.equal(update.currentPage, 5);
  assert.equal(update.status, "READING");
  assert.equal(update.startedAt, now);
  assert.equal(update.finishedAt, null);
});

test("automatically completes a want-to-read book when it advances to its last page", () => {
  const update = buildShelfUpdate(
    state({ status: "WANT_TO_READ", currentPage: 0, startedAt: null }),
    { currentPage: 100 },
    now,
  );

  assert.equal(update.currentPage, 100);
  assert.equal(update.status, "READ");
  assert.equal(update.startedAt, null);
  assert.equal(update.finishedAt, now);
});

test("automatically marks a book read when current page reaches total pages", () => {
  const update = buildShelfUpdate(state(), { currentPage: 100 }, now);

  assert.equal(update.status, "READ");
  assert.equal(update.finishedAt, now);
});

test("reopening a finished book at an earlier page returns it to reading", () => {
  const update = buildShelfUpdate(
    state({ status: "READ", currentPage: 100, finishedAt }),
    { currentPage: 90 },
    now,
  );

  assert.equal(update.status, "READING");
  assert.equal(update.currentPage, 90);
  assert.equal(update.startedAt, startedAt);
  assert.equal(update.finishedAt, null);
});

test("manually marking a book read advances it to the known last page", () => {
  const update = buildShelfUpdate(state(), { status: "READ" }, now);

  assert.equal(update.currentPage, 100);
  assert.equal(update.status, "READ");
  assert.equal(update.finishedAt, now);
});

test("allows marking a book read when the page count is unknown", () => {
  const update = buildShelfUpdate(
    state({ totalPages: null, currentPage: 0 }),
    { status: "READ" },
    now,
  );

  assert.equal(update.status, "READ");
  assert.equal(update.currentPage, 0);
  assert.equal(update.finishedAt, now);
});

test("requires a lower page in the same patch when reopening a finished book", () => {
  assert.throws(
    () =>
      buildShelfUpdate(
        state({ status: "READ", currentPage: 100, finishedAt }),
        { status: "READING" },
        now,
      ),
    (error: unknown) => error instanceof AppError && error.code === "INVALID_STATUS_TRANSITION",
  );
});

test("rejects a page outside the current total", () => {
  assert.throws(
    () => buildShelfUpdate(state(), { currentPage: 101 }, now),
    (error: unknown) => error instanceof AppError && error.code === "PAGE_OUT_OF_RANGE",
  );
});

test("requires a total page count before advancing from zero", () => {
  assert.throws(
    () => buildShelfUpdate(state({ totalPages: null, currentPage: 0 }), { currentPage: 1 }, now),
    (error: unknown) => error instanceof AppError && error.code === "TOTAL_PAGES_REQUIRED",
  );
});

test("moving a book back to want-to-read resets progress dates but preserves other fields", () => {
  const update = buildShelfUpdate(
    state({ status: "READ", currentPage: 100, finishedAt }),
    { status: "WANT_TO_READ", rating: 4, note: "Reread later" },
    now,
  );

  assert.equal(update.status, "WANT_TO_READ");
  assert.equal(update.currentPage, 0);
  assert.equal(update.startedAt, null);
  assert.equal(update.finishedAt, null);
  assert.equal(update.rating, 4);
  assert.equal(update.note, "Reread later");
});

test("rejects moving an in-progress book back to want-to-read", () => {
  assert.throws(
    () => buildShelfUpdate(state(), { status: "WANT_TO_READ" }, now),
    (error: unknown) =>
      error instanceof AppError && error.code === "READING_PROGRESS_CANNOT_BE_RESET",
  );
});

test("allows moving an in-progress book back to want-to-read when progress is reset to zero", () => {
  const update = buildShelfUpdate(state(), { status: "WANT_TO_READ", currentPage: 0 }, now);

  assert.equal(update.status, "WANT_TO_READ");
  assert.equal(update.currentPage, 0);
  assert.equal(update.startedAt, null);
  assert.equal(update.finishedAt, null);
});

test("automatically moves an in-progress book to want-to-read when current page is reset to zero", () => {
  const update = buildShelfUpdate(state(), { currentPage: 0 }, now);

  assert.equal(update.status, "WANT_TO_READ");
  assert.equal(update.currentPage, 0);
  assert.equal(update.startedAt, null);
  assert.equal(update.finishedAt, null);
});

test("rejects changing an edition page count from Open Library", () => {
  assert.throws(
    () => buildShelfUpdate(state({ pageCountSource: "EDITION" }), { totalPages: 120 }, now),
    (error: unknown) => error instanceof AppError && error.code === "PAGE_COUNT_LOCKED",
  );
});

test("allows replacing a zero page count with a manually entered count", () => {
  const update = buildShelfUpdate(
    state({ totalPages: 0, pageCountSource: null }),
    { totalPages: 120 },
    now,
  );

  assert.equal(update.totalPages, 120);
  assert.equal(update.pageCountSource, "MANUAL");
});

test("normalizes a legacy zero page count to unknown when updating another field", () => {
  const update = buildShelfUpdate(
    state({ totalPages: 0, pageCountSource: "EDITION" }),
    { note: "Need to confirm page count" },
    now,
  );

  assert.equal(update.totalPages, null);
  assert.equal(update.pageCountSource, null);
});

test("initial states assign dates and page counts consistently", () => {
  assert.deepEqual(buildInitialReadingState("WANT_TO_READ", 100, now), {
    status: "WANT_TO_READ",
    currentPage: 0,
    startedAt: null,
    finishedAt: null,
  });
  assert.deepEqual(buildInitialReadingState("READING", 100, now), {
    status: "READING",
    currentPage: 0,
    startedAt: now,
    finishedAt: null,
  });
  assert.deepEqual(buildInitialReadingState("READ", 100, now), {
    status: "READ",
    currentPage: 100,
    startedAt: null,
    finishedAt: now,
  });
});
