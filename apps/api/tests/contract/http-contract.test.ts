import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { after, before, test } from "node:test";

// Invalid requests must be rejected before the API attempts a database connection.
process.env.DATABASE_URL ??= "mysql://test:test@127.0.0.1:3306/reading_tracker_test";
process.env.LOG_LEVEL = "silent";
const { app } = await import("../../src/app.js");

let server: Server;
let origin: string;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

async function assertApiError(response: Response, status: number, code: string): Promise<void> {
  assert.equal(response.status, status);
  const body = (await response.json()) as {
    error?: { code?: string; message?: string; details?: unknown[]; requestId?: string };
  };
  assert.equal(body.error?.code, code);
  assert.ok(body.error?.message);
  assert.ok(Array.isArray(body.error?.details));
  assert.ok(body.error?.requestId);
}

test("search validates query and reports HTTP 400 in the standard error envelope", async () => {
  const response = await fetch(`${origin}/api/books?q=x&page=0`);
  await assertApiError(response, 400, "VALIDATION_ERROR");
});

test("shelf add rejects invalid work IDs, statuses, and zero page counts", async () => {
  const response = await fetch(`${origin}/api/shelf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workId: "bad", status: "READING", totalPages: 0 }),
  });
  await assertApiError(response, 400, "VALIDATION_ERROR");
});

test("shelf update rejects invalid IDs, ratings, and empty patches", async () => {
  const invalidId = await fetch(`${origin}/api/shelf/not-a-uuid`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating: 5 }),
  });
  await assertApiError(invalidId, 400, "VALIDATION_ERROR");

  const invalidRating = await fetch(`${origin}/api/shelf/00000000-0000-4000-8000-000000000001`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating: 6 }),
  });
  await assertApiError(invalidRating, 400, "VALIDATION_ERROR");

  const emptyPatch = await fetch(`${origin}/api/shelf/00000000-0000-4000-8000-000000000001`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  await assertApiError(emptyPatch, 400, "VALIDATION_ERROR");
});

test("malformed JSON and unknown routes use the common error contract", async () => {
  const malformedJson = await fetch(`${origin}/api/shelf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  await assertApiError(malformedJson, 400, "INVALID_JSON");

  const missing = await fetch(`${origin}/api/does-not-exist`);
  await assertApiError(missing, 404, "RESOURCE_NOT_FOUND");
});
