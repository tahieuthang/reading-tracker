import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest, type Server } from "node:http";
import { after, before, test } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  test("API and MySQL integration tests require TEST_DATABASE_URL", { skip: true }, () => {});
} else {
  const parsedTestUrl = new URL(testDatabaseUrl);
  assert.equal(
    decodeURIComponent(parsedTestUrl.pathname.slice(1)),
    "reading_tracker_test",
    "Integration tests must target the isolated reading_tracker_test database.",
  );
  assert.ok(
    ["localhost", "127.0.0.1"].includes(parsedTestUrl.hostname),
    "Integration tests must target a local MySQL server.",
  );
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";

  const [{ app }, { prisma }] = await Promise.all([
    import("../../src/app.js"),
    import("../../src/lib/prisma.js"),
  ]);

  let server: Server;
  let origin: string;
  const testWorkId = "OL9000001W";
  const restoreWorkId = "OL9000002W";
  const raceWorkId = "OL9000003W";

  before(async () => {
    await prisma.$connect();
    await prisma.shelfBook.deleteMany();
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    origin = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await prisma.shelfBook.deleteMany();
    await prisma.$disconnect();
    if (server?.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  interface HttpResult {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
  }

  function send(method: string, path: string, body?: unknown): Promise<HttpResult> {
    const url = new URL(path, origin);
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        url,
        {
          method,
          headers: body === undefined ? {} : { "Content-Type": "application/json" },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const raw = Buffer.concat(chunks);
            const contentType = String(res.headers["content-type"] ?? "");
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: contentType.includes("application/json")
                ? JSON.parse(raw.toString("utf8"))
                : raw,
            });
          });
        },
      );
      req.on("error", reject);
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  }

  function data<T>(result: HttpResult): T {
    return (result.body as { data: T }).data;
  }

  function errorCode(result: HttpResult): string | undefined {
    return (result.body as { error?: { code?: string } }).error?.code;
  }

  function workFixture(workId: string) {
    const suffix = workId.replace(/\D/g, "");
    const editionId = `OL${suffix}M`;
    const authorId = `OL${suffix}A`;
    return { workId, editionId, authorId };
  }

  function installOpenLibraryFixture(
    options: {
      failSearch?: boolean;
      blockWorkDetailUntilTwoRequests?: boolean;
    } = {},
  ): () => void {
    const originalFetch = globalThis.fetch;
    let workRequests = 0;
    let releaseWorkRequests!: () => void;
    const bothWorkRequests = new Promise<void>((resolve) => {
      releaseWorkRequests = resolve;
    });

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/search.json") {
        if (options.failSearch) return new Response("upstream unavailable", { status: 503 });
        return Response.json({
          docs: [
            {
              key: `/works/${testWorkId}`,
              title: "Integration Fixture",
              author_name: ["Fixture Author"],
              first_publish_year: 2020,
              cover_i: 123,
            },
          ],
          numFound: 1,
        });
      }
      if (url.pathname.startsWith("/works/") && url.pathname.endsWith("/editions.json")) {
        const workId = url.pathname.split("/")[2] ?? "";
        const fixture = workFixture(workId);
        return Response.json({
          entries: [
            {
              key: `/books/${fixture.editionId}`,
              title: "Fixture Edition",
              publish_date: "2020",
              number_of_pages: 250,
              covers: [321],
            },
          ],
        });
      }
      if (url.pathname.startsWith("/works/") && url.pathname.endsWith(".json")) {
        const workId = url.pathname.split("/")[2]?.replace(".json", "") ?? "";
        const fixture = workFixture(workId);
        if (options.blockWorkDetailUntilTwoRequests && workId === raceWorkId) {
          workRequests += 1;
          if (workRequests === 2) releaseWorkRequests();
          await bothWorkRequests;
        }
        return Response.json({
          title: `Fixture ${workId}`,
          description: { value: "A metadata snapshot used by integration tests." },
          covers: [321],
          subjects: ["Testing", "Databases"],
          authors: [{ author: { key: `/authors/${fixture.authorId}` } }],
          first_publish_date: "2020",
        });
      }
      if (url.pathname.startsWith("/authors/")) return Response.json({ name: "Fixture Author" });
      if (url.pathname === "/b/id/321-M.jpg") {
        return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          headers: { "Content-Type": "image/jpeg" },
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    return () => {
      globalThis.fetch = originalFetch;
    };
  }

  async function addBook(workId: string) {
    return send("POST", "/api/shelf", {
      workId,
      editionId: workFixture(workId).editionId,
      status: "WANT_TO_READ",
    });
  }

  test("search, details, and covers are served by API using normalized metadata", async () => {
    const restore = installOpenLibraryFixture();
    try {
      const search = await send("GET", "/api/books?q=integration-search-unique&page=2");
      const searchData = data<{
        page: number;
        pageSize: number;
        items: Array<{ coverUrl: string; inShelf: boolean }>;
      }>(search);
      assert.equal(search.status, 200);
      assert.equal(searchData.page, 2);
      assert.equal(searchData.pageSize, 20);
      assert.equal(searchData.items[0]?.coverUrl, "/api/covers/123");
      assert.equal(searchData.items[0]?.inShelf, false);

      const detail = await send("GET", `/api/books/${testWorkId}`);
      const detailData = data<{
        description: string;
        editions: Array<{ numberOfPages: number }>;
        authors: string[];
      }>(detail);
      assert.equal(detail.status, 200);
      assert.equal(detailData.description, "A metadata snapshot used by integration tests.");
      assert.equal(detailData.editions[0]?.numberOfPages, 250);
      assert.equal(detailData.authors[0], "Fixture Author");

      const cover = await send("GET", "/api/covers/321");
      assert.equal(cover.status, 200);
      assert.equal(cover.headers["content-type"], "image/jpeg");
      assert.deepEqual(cover.body, Buffer.from([0xff, 0xd8, 0xff]));
    } finally {
      restore();
    }
  });

  test("creates, rejects duplicate, validates progress, and records reading dates in MySQL", async () => {
    const restore = installOpenLibraryFixture();
    try {
      const created = await addBook(testWorkId);
      const createdBook = data<{
        book: {
          id: string;
          title: string;
          totalPages: number;
          currentPage: number;
          status: string;
        };
      }>(created).book;
      assert.equal(created.status, 201);
      const book = createdBook;
      assert.equal(book.title, `Fixture ${testWorkId}`);
      assert.equal(book.totalPages, 250);
      assert.equal(book.currentPage, 0);
      assert.equal(book.status, "WANT_TO_READ");

      const duplicate = await addBook(testWorkId);
      assert.equal(duplicate.status, 409);
      assert.equal(errorCode(duplicate), "BOOK_ALREADY_IN_SHELF");

      const badRating = await send("PATCH", `/api/shelf/${book.id}`, { rating: 6 });
      assert.equal(badRating.status, 400);
      const outOfRange = await send("PATCH", `/api/shelf/${book.id}`, { currentPage: 251 });
      assert.equal(outOfRange.status, 422);
      assert.equal(errorCode(outOfRange), "PAGE_OUT_OF_RANGE");

      const progress = await send("PATCH", `/api/shelf/${book.id}`, {
        currentPage: 5,
        rating: 4,
        note: "Good start",
      });
      const progressBook = data<{
        status: string;
        progressPercent: number;
        rating: number;
        startedAt: string;
      }>(progress);
      assert.equal(progress.status, 200);
      assert.equal(progressBook.status, "READING");
      assert.equal(progressBook.progressPercent, 2);
      assert.equal(progressBook.rating, 4);
      assert.ok(progressBook.startedAt);

      const finished = await send("PATCH", `/api/shelf/${book.id}`, { currentPage: 250 });
      const finishedBook = data<{ status: string; finishedAt: string }>(finished);
      assert.equal(finished.status, 200);
      assert.equal(finishedBook.status, "READ");
      assert.ok(finishedBook.finishedAt);

      const lockedPageCount = await send("PATCH", `/api/shelf/${book.id}`, { totalPages: 300 });
      assert.equal(lockedPageCount.status, 422);
      assert.equal(errorCode(lockedPageCount), "PAGE_COUNT_LOCKED");
    } finally {
      restore();
    }
  });

  test("soft delete excludes the book from shelf/stats and restore keeps reading data", async () => {
    const restore = installOpenLibraryFixture();
    try {
      const created = await addBook(restoreWorkId);
      const book = data<{ book: { id: string } }>(created).book;
      await send("PATCH", `/api/shelf/${book.id}`, {
        currentPage: 44,
        rating: 5,
        note: "Keep this note",
      });
      const deleted = await send("DELETE", `/api/shelf/${book.id}`);
      assert.equal(deleted.status, 204);

      const shelf = await send("GET", "/api/shelf");
      assert.equal(
        data<{ items: Array<{ workId: string }> }>(shelf).items.some(
          (item) => item.workId === restoreWorkId,
        ),
        false,
      );
      const stats = await send("GET", "/api/shelf/stats");
      assert.equal(data<{ totalBooks: number }>(stats).totalBooks, 1);

      const restored = await addBook(restoreWorkId);
      const restoredData = data<{
        restored: boolean;
        book: { currentPage: number; status: string; rating: number; note: string };
      }>(restored);
      assert.equal(restored.status, 200);
      assert.equal(restoredData.restored, true);
      assert.equal(restoredData.book.currentPage, 44);
      assert.equal(restoredData.book.status, "READING");
      assert.equal(restoredData.book.rating, 5);
      assert.equal(restoredData.book.note, "Keep this note");
    } finally {
      restore();
    }
  });

  test("parallel duplicate adds keep one row and return one 409 conflict", async () => {
    const restore = installOpenLibraryFixture({ blockWorkDetailUntilTwoRequests: true });
    try {
      const results = await Promise.all([addBook(raceWorkId), addBook(raceWorkId)]);
      assert.deepEqual(
        results.map((result) => result.status).sort((a, b) => a - b),
        [201, 409],
      );
      assert.equal(await prisma.shelfBook.count({ where: { workId: raceWorkId } }), 1);
    } finally {
      restore();
    }
  });

  test("upstream failures become a standardized 503 API response", async () => {
    const restore = installOpenLibraryFixture({ failSearch: true });
    try {
      const response = await send("GET", "/api/books?q=integration-upstream-failure&page=1");
      assert.equal(response.status, 503);
      assert.equal(errorCode(response), "UPSTREAM_UNAVAILABLE");
      assert.ok((response.body as { error: { requestId?: string } }).error.requestId);
    } finally {
      restore();
    }
  });
}
