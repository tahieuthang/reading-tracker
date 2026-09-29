import { expect, test } from "@playwright/test";

test("search, add a book, finish it, and remove it from the shelf", async ({ page }) => {
  const book = {
    id: "00000000-0000-4000-8000-000000000001",
    workId: "OL123456W",
    editionId: "OL123456M",
    title: "E2E Reading Fixture",
    authors: ["Test Author"],
    coverId: 123,
    coverUrl: "/api/covers/123",
    firstPublishYear: 2020,
    description: "A browser flow fixture.",
    subjects: ["Testing"],
    pageCountSource: "EDITION",
    totalPages: 100,
    currentPage: 0,
    progressPercent: 0,
    status: "WANT_TO_READ",
    rating: null,
    note: null,
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
  };
  let shelfBook: typeof book | null = null;
  let bookDeleted = false;
  const apiRequests: string[] = [];
  const directOpenLibraryRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) apiRequests.push(url.href);
    if (url.hostname.endsWith("openlibrary.org")) directOpenLibraryRequests.push(url.href);
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname === "/api/covers/123" && method === "GET") {
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    }

    if (url.pathname === "/api/books" && method === "GET") {
      return route.fulfill({
        json: {
          data: {
            items: [
              {
                workId: book.workId,
                title: book.title,
                authors: book.authors,
                firstPublishYear: book.firstPublishYear,
                coverId: book.coverId,
                coverUrl: book.coverUrl,
                inShelf: shelfBook !== null && !bookDeleted,
                hasArchivedProgress: false,
              },
            ],
            total: 1,
            page: Number(url.searchParams.get("page") ?? 1),
            pageSize: 20,
          },
        },
      });
    }

    if (url.pathname === `/api/books/${book.workId}` && method === "GET") {
      return route.fulfill({
        json: {
          data: {
            workId: book.workId,
            title: book.title,
            authors: book.authors,
            firstPublishYear: book.firstPublishYear,
            coverId: book.coverId,
            coverUrl: book.coverUrl,
            inShelf: shelfBook !== null && !bookDeleted,
            hasArchivedProgress: false,
            description: book.description,
            subjects: book.subjects,
            editions: [
              {
                editionId: book.editionId,
                title: "Fixture Edition",
                publishDate: "2020",
                numberOfPages: 100,
                coverId: null,
              },
            ],
          },
        },
      });
    }

    if (url.pathname === "/api/shelf" && method === "POST") {
      shelfBook = { ...book };
      bookDeleted = false;
      return route.fulfill({ status: 201, json: { data: { book: shelfBook, restored: false } } });
    }

    if (url.pathname === "/api/shelf/stats" && method === "GET") {
      const active = shelfBook !== null && !bookDeleted;
      return route.fulfill({
        json: {
          data: {
            totalBooks: active ? 1 : 0,
            readingBooks: active && shelfBook.status === "READING" ? 1 : 0,
            readBooks: active && shelfBook.status === "READ" ? 1 : 0,
          },
        },
      });
    }

    if (url.pathname === "/api/shelf" && method === "GET") {
      const active = shelfBook !== null && !bookDeleted;
      const status = url.searchParams.get("status");
      const items = active && (!status || shelfBook.status === status) ? [shelfBook] : [];
      return route.fulfill({ json: { data: { items } } });
    }

    if (url.pathname === `/api/shelf/${book.id}` && method === "PATCH") {
      const patch = request.postDataJSON() as Partial<typeof book>;
      shelfBook = {
        ...shelfBook!,
        ...patch,
        progressPercent: Math.round(((patch.currentPage ?? shelfBook!.currentPage) / 100) * 100),
        startedAt: patch.currentPage && patch.currentPage > 0 ? "2026-09-29T00:00:00.000Z" : null,
        finishedAt: patch.status === "READ" ? "2026-09-29T00:00:00.000Z" : null,
      };
      return route.fulfill({ json: { data: shelfBook } });
    }

    if (url.pathname === `/api/shelf/${book.id}` && method === "DELETE") {
      bookDeleted = true;
      return route.fulfill({ status: 204, body: "" });
    }

    return route.fulfill({ status: 404, json: { error: { code: "UNEXPECTED_TEST_REQUEST" } } });
  });

  await page.goto("/");
  await page.getByRole("searchbox", { name: "Tìm theo tên sách hoặc tác giả" }).fill("Fixture");
  await page.getByRole("button", { name: /Tìm sách/ }).click();
  await expect(page.getByRole("link", { name: book.title, exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Thêm vào tủ/ }).click();
  await expect(page.getByText(/Đã thêm/)).toBeVisible();
  await page.getByRole("link", { name: "Tủ sách" }).click();
  await expect(page.getByRole("button", { name: book.title, exact: true })).toBeVisible();

  await page.getByLabel("Trang hiện tại").fill("100");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByText("Đã lưu cập nhật sách.")).toBeVisible();
  await page.getByRole("tab", { name: /Đã đọc/ }).click();
  await expect(page.getByRole("progressbar", { name: `Tiến độ ${book.title}` })).toHaveAttribute(
    "aria-valuenow",
    "100",
  );

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Xóa khỏi tủ" }).click();
  await expect(page.getByText("Chưa có sách đã đọc")).toBeVisible();
  await expect(page.getByText("Đã xóa sách khỏi tủ.")).toBeVisible();

  expect(apiRequests.length).toBeGreaterThan(0);
  expect(
    apiRequests.every((requestUrl) => new URL(requestUrl).origin === new URL(page.url()).origin),
  ).toBe(true);
  expect(apiRequests.some((requestUrl) => new URL(requestUrl).pathname === "/api/covers/123")).toBe(
    true,
  );
  expect(directOpenLibraryRequests).toEqual([]);
});
