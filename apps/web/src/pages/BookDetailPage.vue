<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { RouterLink, useRoute } from "vue-router";
import BookCover from "../components/BookCover.vue";
import { api, statusLabels, type ShelfStatus } from "../lib/api";

const route = useRoute();
const client = useQueryClient();
const workId = computed(() => String(route.params.workId));
const detail = useQuery({
  queryKey: computed(() => ["book", workId.value]),
  queryFn: () => api.getBook(workId.value),
});
const status = ref<ShelfStatus>("WANT_TO_READ");
const editionId = ref("");
const manualPages = ref("");
const useManualPages = ref(false);
const notice = ref("");

watch(
  () => detail.data.value?.editions,
  (editions) => {
    if (editions && !editionId.value)
      editionId.value = editions.find((edition) => edition.numberOfPages)?.editionId ?? "";
  },
  { immediate: true },
);

const selectedEdition = computed(() =>
  detail.data.value?.editions.find((edition) => edition.editionId === editionId.value),
);
const availablePages = computed(() => {
  if (useManualPages.value) return manualPages.value ? Number(manualPages.value) : null;
  return selectedEdition.value?.numberOfPages ?? null;
});

const addMutation = useMutation({
  mutationFn: () =>
    api.addToShelf({
      workId: workId.value,
      status: status.value,
      ...(useManualPages.value
        ? { totalPages: manualPages.value ? Number(manualPages.value) : null }
        : editionId.value
          ? { editionId: editionId.value }
          : {}),
    }),
  onSuccess: async (result) => {
    notice.value = result.restored
      ? "Đã khôi phục sách cùng tiến độ đọc trước đó."
      : "Đã thêm sách vào tủ của bạn.";
    await Promise.all([
      client.invalidateQueries({ queryKey: ["book", workId.value] }),
      client.invalidateQueries({ queryKey: ["books"] }),
      client.invalidateQueries({ queryKey: ["shelf"] }),
      client.invalidateQueries({ queryKey: ["shelf-stats"] }),
    ]);
  },
  onError: (error) =>
    (notice.value = error instanceof Error ? error.message : "Không thể thêm sách lúc này."),
});

const book = computed(() => detail.data.value);
const detailError = computed(() => detail.error.value);
const detailPending = computed(() => detail.isPending.value);
const detailFailed = computed(() => detail.isError.value);
const adding = computed(() => addMutation.isPending.value);

const pageChoices = computed(() =>
  (detail.data.value?.editions ?? []).filter((edition) => edition.numberOfPages),
);
</script>

<template>
  <div>
    <RouterLink
      to="/"
      class="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-emerald-900"
      >← Quay lại tìm kiếm</RouterLink
    >
    <div v-if="detailPending" class="mt-7 grid animate-pulse gap-8 md:grid-cols-[260px_1fr]">
      <div class="aspect-[3/4] rounded-3xl bg-stone-200"></div>
      <div>
        <div class="h-8 w-2/3 rounded bg-stone-200"></div>
        <div class="mt-4 h-4 w-1/3 rounded bg-stone-100"></div>
        <div class="mt-10 h-40 rounded-2xl bg-stone-100"></div>
      </div>
    </div>
    <div v-else-if="detailFailed" class="state-panel mt-8" role="alert">
      <span class="state-icon">!</span>
      <h1 class="mt-3 font-serif text-2xl">Không tải được chi tiết sách</h1>
      <p class="mt-2 text-sm text-stone-600">{{ detailError?.message }}</p>
      <button class="button-secondary mt-5" @click="detail.refetch()">Thử lại</button>
    </div>
    <template v-else-if="book">
      <div class="mt-6 grid gap-8 lg:grid-cols-[minmax(220px,300px)_1fr] lg:gap-12">
        <div class="mx-auto w-full max-w-[280px] lg:mx-0">
          <BookCover :src="book.coverUrl" :title="book.title" />
        </div>
        <div>
          <p class="section-eyebrow">Chi tiết tác phẩm · {{ book.workId }}</p>
          <h1 class="mt-3 font-serif text-3xl leading-tight text-stone-900 sm:text-4xl">
            {{ book.title }}
          </h1>
          <p class="mt-3 text-lg text-stone-600">
            {{ book.authors.join(", ") || "Chưa rõ tác giả"
            }}<span v-if="book.firstPublishYear"> · {{ book.firstPublishYear }}</span>
          </p>
          <div
            v-if="notice"
            class="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            role="status"
          >
            {{ notice }}
            <RouterLink to="/shelf" class="ml-2 font-semibold underline">Mở tủ sách</RouterLink>
          </div>

          <div
            v-if="book.inShelf && !book.hasArchivedProgress"
            class="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900"
          >
            ✓ Đã có trong tủ <RouterLink to="/shelf" class="underline">Xem tủ sách</RouterLink>
          </div>
          <section
            v-else
            class="mt-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="section-eyebrow">Lưu vào tủ sách</p>
                <h2 class="mt-1 font-serif text-xl">Bạn muốn bắt đầu ở đâu?</h2>
              </div>
              <span
                v-if="book.hasArchivedProgress"
                class="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900"
                >Có tiến độ đã lưu</span
              >
            </div>
            <div class="mt-5 grid gap-4 sm:grid-cols-2">
              <label class="field-label"
                >Trạng thái ban đầu
                <select v-model="status" class="field-input mt-1.5">
                  <option value="WANT_TO_READ">{{ statusLabels.WANT_TO_READ }}</option>
                  <option value="READING">{{ statusLabels.READING }}</option>
                  <option value="READ">{{ statusLabels.READ }}</option>
                </select>
              </label>
              <label class="field-label"
                >Ấn bản / số trang
                <select
                  v-if="pageChoices.length && !useManualPages"
                  v-model="editionId"
                  class="field-input mt-1.5"
                >
                  <option
                    v-for="edition in pageChoices"
                    :key="edition.editionId"
                    :value="edition.editionId"
                  >
                    {{ edition.title }} · {{ edition.numberOfPages }} trang
                  </option>
                </select>
                <input
                  v-else-if="useManualPages"
                  v-model="manualPages"
                  class="field-input mt-1.5"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Nhập tổng số trang"
                />
                <span
                  v-else
                  class="mt-1.5 block rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-500"
                  >Chưa có thông tin số trang</span
                >
              </label>
            </div>
            <div
              class="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-stone-500"
            >
              <span v-if="availablePages">Tiến độ ban đầu: 0 / {{ availablePages }} trang</span
              ><span v-else>Không có số trang thì có thể bổ sung trong tủ sách.</span>
              <button
                class="font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4"
                @click="useManualPages = !useManualPages"
              >
                {{ useManualPages ? "Chọn ấn bản có sẵn" : "Tự nhập số trang" }}
              </button>
            </div>
            <button
              class="button-primary mt-5 w-full justify-center"
              :disabled="
                adding ||
                (useManualPages &&
                  !!manualPages &&
                  (!Number.isInteger(Number(manualPages)) || Number(manualPages) < 1))
              "
              @click="addMutation.mutate()"
            >
              {{
                adding
                  ? "Đang lưu…"
                  : book.hasArchivedProgress
                    ? "Khôi phục sách và tiến độ"
                    : "Thêm vào tủ sách"
              }}
            </button>
          </section>

          <section class="mt-9">
            <h2 class="font-serif text-xl">Giới thiệu</h2>
            <p class="mt-3 whitespace-pre-line text-sm leading-7 text-stone-600">
              {{ book.description || "Chưa có phần giới thiệu cho tác phẩm này." }}
            </p>
          </section>
          <section v-if="book.subjects.length" class="mt-7">
            <h2 class="font-serif text-lg">Chủ đề</h2>
            <div class="mt-3 flex flex-wrap gap-2">
              <span
                v-for="subject in book.subjects.slice(0, 18)"
                :key="subject"
                class="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600"
                >{{ subject }}</span
              >
            </div>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>
