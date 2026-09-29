import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import BookCover from "../src/components/BookCover.vue";
import ShelfBookCard from "../src/components/ShelfBookCard.vue";
import type { ShelfBook } from "../src/lib/api";

function shelfBook(overrides: Partial<ShelfBook> = {}): ShelfBook {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    workId: "OL123456W",
    editionId: null,
    title: "Một cuốn sách",
    authors: ["Tác giả"],
    coverId: null,
    coverUrl: null,
    firstPublishYear: 2020,
    description: null,
    subjects: [],
    pageCountSource: "MANUAL",
    totalPages: 100,
    currentPage: 0,
    progressPercent: 0,
    status: "WANT_TO_READ",
    rating: null,
    note: null,
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("BookCover", () => {
  it("shows a fallback when the cover request fails", async () => {
    const wrapper = mount(BookCover, { props: { src: "/api/covers/42", title: "Bìa lỗi" } });
    await wrapper.get("img").trigger("error");

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Bìa lỗi");
    expect(wrapper.find('[aria-label="Chưa có ảnh bìa"]').exists()).toBe(true);
  });
});

describe("ShelfBookCard", () => {
  it("sends a valid page update and derives reading status from progress", async () => {
    const wrapper = mount(ShelfBookCard, { props: { book: shelfBook() } });
    await wrapper.find('input[type="number"]').setValue("5");
    await flushPromises();

    const save = wrapper.get("button[aria-busy]");
    expect((save.element as HTMLButtonElement).disabled).toBe(false);
    await save.trigger("click");

    const emitted = wrapper.emitted("save")?.[0];
    expect(emitted?.[0]).toBe("00000000-0000-4000-8000-000000000001");
    expect(emitted?.[1]).toMatchObject({ currentPage: 5, status: "READING" });
  });

  it("locks edition page counts and rejects out-of-range progress in the UI", async () => {
    const locked = mount(ShelfBookCard, {
      props: { book: shelfBook({ pageCountSource: "EDITION" }) },
    });
    expect((locked.findAll('input[type="number"]')[1]?.element as HTMLInputElement).disabled).toBe(
      true,
    );

    const wrapper = mount(ShelfBookCard, { props: { book: shelfBook() } });
    await wrapper.find('input[type="number"]').setValue("101");
    await flushPromises();
    await wrapper.get("button[aria-busy]").trigger("click");

    expect(wrapper.emitted("save")).toBeUndefined();
    expect(wrapper.text()).toContain(
      "Trang hiện tại phải nằm trong khoảng từ 0 đến tổng số trang.",
    );
  });

  it("requires delete confirmation before emitting removal", async () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    const book = shelfBook();
    const wrapper = mount(ShelfBookCard, { props: { book } });

    await wrapper.get("button.text-rose-700").trigger("click");
    expect(wrapper.emitted("remove")).toBeUndefined();
    await wrapper.get("button.text-rose-700").trigger("click");
    expect(wrapper.emitted("remove")?.[0]?.[0]).toEqual(book);
    vi.unstubAllGlobals();
  });
});
