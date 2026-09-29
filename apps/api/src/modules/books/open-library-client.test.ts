import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../middleware/app-error.js";

process.env.DATABASE_URL ??= "mysql://test:test@127.0.0.1:3306/reading_tracker_test";
const { OpenLibraryClient } = await import("./open-library-client.js");

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function withFetchMock(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("search requests 20 records for the requested page and validates upstream data", async () => {
  const client = new OpenLibraryClient();
  await withFetchMock(
    async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://openlibrary.org");
      assert.equal(url.pathname, "/search.json");
      assert.equal(url.searchParams.get("q"), "noto-test-unique");
      assert.equal(url.searchParams.get("page"), "3");
      assert.equal(url.searchParams.get("limit"), "20");
      assert.match(new Headers(init?.headers).get("User-Agent") ?? "", /ReadingTracker/);
      return jsonResponse({ docs: [{ key: "/works/OL123456W", title: "Test" }], numFound: 1 });
    },
    async () => {
      const result = await client.search("noto-test-unique", 3);
      assert.equal(result.docs[0]?.title, "Test");
    },
  );
});

test("maps upstream 429/5xx to a retryable 503 API error", async () => {
  const client = new OpenLibraryClient();
  await withFetchMock(
    async () => new Response("busy", { status: 503 }),
    async () => {
      await assert.rejects(
        client.search("upstream-failure-unique", 1),
        (error: unknown) =>
          error instanceof AppError &&
          error.statusCode === 503 &&
          error.code === "UPSTREAM_UNAVAILABLE",
      );
    },
  );
});

test("rejects malformed Open Library JSON schema", async () => {
  const client = new OpenLibraryClient();
  await withFetchMock(
    async () => jsonResponse({ docs: "not-an-array" }),
    async () => {
      await assert.rejects(
        client.search("malformed-upstream-unique", 1),
        (error: unknown) =>
          error instanceof AppError &&
          error.statusCode === 502 &&
          error.code === "UPSTREAM_INVALID_RESPONSE",
      );
    },
  );
});

test("proxies valid cover bytes and rejects a non-image content type", async () => {
  const client = new OpenLibraryClient();
  await withFetchMock(
    async (input) => {
      assert.equal(
        String(input),
        "https://covers.openlibrary.org/b/id/87654321-M.jpg?default=false",
      );
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    },
    async () => {
      const cover = await client.getCover(87654321);
      assert.equal(cover.contentType, "image/jpeg");
      assert.deepEqual([...cover.body], [0xff, 0xd8, 0xff]);
    },
  );

  await withFetchMock(
    async () => new Response("not an image", { headers: { "Content-Type": "text/html" } }),
    async () => {
      await assert.rejects(
        client.getCover(87654322),
        (error: unknown) =>
          error instanceof AppError &&
          error.statusCode === 502 &&
          error.code === "UPSTREAM_INVALID_RESPONSE",
      );
    },
  );
});
