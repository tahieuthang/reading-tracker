import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SearchPage from "../src/pages/SearchPage.vue";
import ShelfPage from "../src/pages/ShelfPage.vue";

const mocks = vi.hoisted(() => ({
  searchBooks: vi.fn(),
  getShelf: vi.fn(),
  getShelfStats: vi.fn(),
  getBook: vi.fn(),
  addToShelf: vi.fn(),
  updateShelfBook: vi.fn(),
  removeFromShelf: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: mocks,
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      message: string,
      public status: number,
      public code?: string,
    ) {
      super(message);
    }
  },
  statusLabels: { WANT_TO_READ: "Muốn đọc", READING: "Đang đọc", READ: "Đã đọc" },
  statusOptions: ["WANT_TO_READ", "READING", "READ"],
}));

function makeSearchResult(items: unknown[] = [], total = items.length) {
  return { items, total, page: 1, pageSize: 20 };
}

function searchBook(overrides: Record<string, unknown> = {}) {
  return {
    workId: "OL123456W",
    title: "Một cuốn sách",
    authors: ["Tác giả"],
    firstPublishYear: 2020,
    coverId: 123,
    coverUrl: "/api/covers/123",
    inShelf: false,
    hasArchivedProgress: false,
    ...overrides,
  };
}

async function mountPage(component: typeof SearchPage | typeof ShelfPage, path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "search", component: SearchPage },
      { path: "/shelf", name: "shelf", component: ShelfPage },
    ],
  });
  await router.push(path);
  await router.isReady();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = mount(component, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }]] },
  });
  return { wrapper, router, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("scrollTo", vi.fn());
});

describe("SearchPage", () => {
  it("shows loading, then renders search results and shelf badges", async () => {
    let resolveSearch!: (value: ReturnType<typeof makeSearchResult>) => void;
    mocks.searchBooks.mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      }),
    );
    const { wrapper } = await mountPage(SearchPage, "/?q=alpha");

    expect(wrapper.findAll(".animate-pulse")).toHaveLength(12);
    resolveSearch(
      makeSearchResult([searchBook(), searchBook({ workId: "OL123457W", inShelf: true })], 2),
    );
    await flushPromises();

    expect(wrapper.text()).toContain("Một cuốn sách");
    expect(wrapper.text()).toContain("Đã thêm");
    expect(wrapper.findAll("article")).toHaveLength(2);
  });

  it("shows empty and upstream error states", async () => {
    mocks.searchBooks.mockResolvedValueOnce(makeSearchResult());
    const emptyPage = await mountPage(SearchPage, "/?q=empty-query");
    await flushPromises();
    expect(emptyPage.wrapper.text()).toContain("Không tìm thấy kết quả");
    emptyPage.wrapper.unmount();

    mocks.searchBooks.mockRejectedValueOnce(new Error("Open Library không khả dụng"));
    const errorPage = await mountPage(SearchPage, "/?q=error-query");
    await flushPromises();
    expect(errorPage.wrapper.text()).toContain("Chưa thể tìm sách");
    expect(errorPage.wrapper.text()).toContain("Open Library không khả dụng");
    errorPage.wrapper.unmount();
  });

  it("loads the next page when the pagination control is used", async () => {
    mocks.searchBooks.mockResolvedValue(makeSearchResult([searchBook()], 41));
    const { wrapper } = await mountPage(SearchPage, "/?q=alpha&page=1");
    await flushPromises();

    const nextButton = wrapper.findAll("button").find((button) => button.text().includes("Tiếp"));
    expect(nextButton).toBeDefined();
    await nextButton!.trigger("click");
    await flushPromises();

    expect(mocks.searchBooks).toHaveBeenLastCalledWith("alpha", 2);
    expect(wrapper.text()).toContain("2 / 3");
  });
});

describe("ShelfPage", () => {
  it("shows quick stats and switches status tabs", async () => {
    mocks.getShelfStats.mockResolvedValue({ totalBooks: 7, readingBooks: 2, readBooks: 3 });
    mocks.getShelf.mockResolvedValue([]);
    const { wrapper } = await mountPage(ShelfPage, "/shelf");
    await flushPromises();

    expect(wrapper.text()).toContain("7");
    expect(wrapper.text()).toContain("Đang đọc");
    expect(wrapper.text()).toContain("Đã đọc xong");
    const readingTab = wrapper
      .findAll('[role="tab"]')
      .find((tab) => tab.text().includes("Đang đọc"));
    expect(readingTab).toBeDefined();
    await readingTab!.trigger("click");
    await flushPromises();

    expect(mocks.getShelf).toHaveBeenCalledWith("READING");
    expect(readingTab!.attributes("aria-selected")).toBe("true");
  });
});
