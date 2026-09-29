<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { useRoute, useRouter } from "vue-router";
import BookSearchCard from "../components/BookSearchCard.vue";
import { api, ApiRequestError } from "../lib/api";

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const keyword = computed(() => (typeof route.query.q === "string" ? route.query.q : ""));
const page = computed(() => {
  const value = Number(route.query.page ?? 1);
  return Number.isInteger(value) && value > 0 ? value : 1;
});
const draft = ref(keyword.value);
const notice = ref("");
watch(keyword, (value) => (draft.value = value));

const search = useQuery({
  queryKey: computed(() => ["books", keyword.value, page.value]),
  queryFn: () => api.searchBooks(keyword.value, page.value),
  enabled: computed(() => keyword.value.trim().length >= 2),
  staleTime: 30_000,
});

const addMutation = useMutation({
  mutationFn: async (workId: string) => {
    const detail = await api.getBook(workId);
    const edition = detail.editions.find((candidate) => candidate.numberOfPages !== null);
    const result = await api.addToShelf({
      workId,
      status: "WANT_TO_READ",
      ...(edition ? { editionId: edition.editionId } : {}),
    });
    return { result, edition };
  },
  onSuccess: async ({ result, edition }) => {
    notice.value = result.restored
      ? "Sách và tiến độ cũ đã được khôi phục vào tủ."
      : result.book.totalPages === null
        ? "Đã thêm sách. Open Library chưa có số trang cho các ấn bản tìm thấy; bạn có thể nhập trong tủ sách."
        : `Đã thêm sách với số trang từ ấn bản “${edition?.title ?? "được Open Library cung cấp"}”.`;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["books"] }),
      queryClient.invalidateQueries({ queryKey: ["shelf"] }),
      queryClient.invalidateQueries({ queryKey: ["shelf-stats"] }),
    ]);
  },
  onError: (error) => {
    notice.value =
      error instanceof ApiRequestError && error.status === 409
        ? "Sách này đã có trong tủ sách."
        : error instanceof Error
          ? error.message
          : "Không thể thêm sách lúc này.";
  },
});

const searchData = computed(() => search.data.value);
const searchError = computed(() => search.error.value);
const searchPending = computed(() => search.isPending.value);
const searchFailed = computed(() => search.isError.value);
const searchFetching = computed(() => search.isFetching.value);
const addingWorkId = computed(() => addMutation.variables.value);
const adding = computed(() => addMutation.isPending.value);

const totalPages = computed(() =>
  Math.min(
    1000,
    Math.max(1, Math.ceil((search.data.value?.total ?? 0) / (search.data.value?.pageSize ?? 20))),
  ),
);

function submitSearch(value = draft.value) {
  const q = value.trim();
  notice.value = "";
  if (q.length < 2) return;
  draft.value = q;
  void router.push({ name: "search", query: { q, page: "1" } });
}

function goToPage(target: number) {
  void router.push({ name: "search", query: { q: keyword.value, page: String(target) } });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
</script>

<template>
  <section>
    <div
      class="relative overflow-hidden rounded-[2rem] bg-emerald-950 px-6 py-9 text-white shadow-xl sm:px-10 sm:py-14"
    >
      <div
        class="absolute -right-10 -top-24 size-72 rounded-full border border-white/10"
        aria-hidden="true"
      ></div>
      <div
        class="absolute -right-2 -top-16 size-56 rounded-full border border-white/10"
        aria-hidden="true"
      ></div>
      <div class="relative max-w-2xl">
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
          Thư viện bắt đầu từ đây
        </p>
        <h1 class="mt-4 max-w-xl font-serif text-4xl leading-tight sm:text-5xl">
          Tìm cuốn sách tiếp theo của bạn.
        </h1>
        <p class="mt-4 max-w-xl text-sm leading-6 text-emerald-50/80 sm:text-base">
          Khám phá hàng triệu đầu sách, lưu những cuốn bạn yêu thích và giữ nhịp đọc theo cách của
          riêng mình.
        </p>
        <form
          class="mt-7 flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-lg sm:flex-row"
          role="search"
          @submit.prevent="submitSearch()"
        >
          <label class="sr-only" for="book-search">Tìm theo tên sách hoặc tác giả</label>
          <input
            id="book-search"
            v-model="draft"
            class="min-w-0 flex-1 rounded-xl border-0 px-4 py-3 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-emerald-700"
            type="search"
            minlength="2"
            maxlength="200"
            placeholder="Tên sách hoặc tác giả…"
          />
          <button
            class="button-primary justify-center px-6 !cursor-pointer"
            type="submit"
            :disabled="keyword.trim().length < 2 && draft.trim().length < 2"
          >
            Tìm sách <span aria-hidden="true">↗</span>
          </button>
        </form>
        <div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-emerald-50/75">
          <span>Gợi ý:</span>
          <button
            v-for="suggestion in ['The Hobbit', 'Jane Austen', 'Sapiens']"
            :key="suggestion"
            class="rounded-full border border-white/20 px-3 py-1.5 transition hover:bg-white/10"
            @click="submitSearch(suggestion)"
          >
            {{ suggestion }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="notice"
      class="mt-6 flex items-start justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      role="status"
    >
      <span>{{ notice }}</span
      ><button class="text-lg leading-none" aria-label="Đóng thông báo" @click="notice = ''">
        ×
      </button>
    </div>

    <section
      v-if="keyword.length < 2"
      class="mt-12 grid gap-8 md:grid-cols-[1.1fr_0.9fr] md:items-center"
    >
      <div>
        <p class="section-eyebrow">Tủ sách theo nhịp của bạn</p>
        <h2 class="mt-3 max-w-lg font-serif text-3xl leading-tight text-stone-900 sm:text-4xl">
          Mỗi trang sách đều đáng được ghi nhớ.
        </h2>
        <p class="mt-4 max-w-lg leading-7 text-stone-600">
          Lưu sách muốn đọc, cập nhật trang đang đọc và nhìn lại hành trình của mình qua từng cuốn.
        </p>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div
          v-for="(label, index) in ['Muốn đọc', 'Đang đọc', 'Đã đọc']"
          :key="label"
          class="flex aspect-[4/5] flex-col justify-between rounded-2xl p-4 shadow-sm"
          :class="['bg-[#e9dfc9]', 'bg-[#d9e5d7]', 'bg-[#e5dce8]'][index]"
        >
          <span class="font-serif text-3xl text-stone-700">0{{ index + 1 }}</span
          ><span class="text-xs font-semibold text-stone-700">{{ label }}</span>
        </div>
      </div>
    </section>

    <section v-else class="mt-10">
      <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="section-eyebrow">Kết quả tìm kiếm</p>
          <h2 class="mt-1 font-serif text-2xl text-stone-900 sm:text-3xl">“{{ keyword }}”</h2>
        </div>
        <p v-if="searchData" class="text-sm text-stone-500">
          {{ searchData.total.toLocaleString("vi-VN") }} kết quả · trang {{ page }} /
          {{ totalPages }}
        </p>
      </div>

      <div
        v-if="searchPending"
        class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      >
        <div
          v-for="index in 12"
          :key="index"
          class="animate-pulse rounded-2xl border border-stone-200 bg-white p-3"
        >
          <div class="aspect-[3/4] rounded-xl bg-stone-200"></div>
          <div class="mt-3 h-4 rounded bg-stone-200"></div>
          <div class="mt-2 h-3 w-2/3 rounded bg-stone-100"></div>
        </div>
      </div>
      <div v-else-if="searchFailed" class="state-panel" role="alert">
        <span class="state-icon">!</span>
        <h3 class="mt-3 font-serif text-xl">Chưa thể tìm sách</h3>
        <p class="mt-2 max-w-md text-sm leading-6 text-stone-600">{{ searchError?.message }}</p>
        <button class="button-secondary mt-5" @click="search.refetch()">Thử lại</button>
      </div>
      <div v-else-if="searchData?.items.length === 0" class="state-panel">
        <span class="state-icon">⌕</span>
        <h3 class="mt-3 font-serif text-xl">Không tìm thấy kết quả</h3>
        <p class="mt-2 text-sm text-stone-600">Thử tên sách hoặc tác giả khác nhé.</p>
      </div>
      <div
        v-else-if="searchData"
        class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      >
        <BookSearchCard
          v-for="book in searchData.items"
          :key="book.workId"
          :book="book"
          :adding="adding && addingWorkId === book.workId"
          @add="addMutation.mutate"
        />
      </div>

      <div v-if="searchData && totalPages > 1" class="mt-8 flex items-center justify-center gap-3">
        <button
          class="button-secondary cursor-pointer"
          :disabled="page <= 1 || searchFetching"
          @click="goToPage(page - 1)"
        >
          ← Trước
        </button>
        <span class="text-sm tabular-nums text-stone-600">{{ page }} / {{ totalPages }}</span>
        <button
          class="button-secondary cursor-pointer"
          :disabled="page >= totalPages || searchFetching"
          @click="goToPage(page + 1)"
        >
          Tiếp →
        </button>
      </div>
    </section>
  </section>
</template>
