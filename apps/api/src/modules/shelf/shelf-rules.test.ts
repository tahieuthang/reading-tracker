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
