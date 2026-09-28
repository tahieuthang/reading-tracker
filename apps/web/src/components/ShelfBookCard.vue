<script setup lang="ts">
import { reactive, watch } from "vue";
import type { ShelfBook, ShelfStatus } from "../lib/api";
import { statusLabels, statusOptions } from "../lib/api";
import BookCover from "./BookCover.vue";

const props = defineProps<{ book: ShelfBook; saving?: boolean; deleting?: boolean }>();
const emit = defineEmits<{
  save: [
    id: string,
    patch: Partial<Pick<ShelfBook, "status" | "totalPages" | "currentPage" | "rating" | "note">>,
  ];
  remove: [book: ShelfBook];
  open: [book: ShelfBook];
}>();

const draft = reactive({
  status: props.book.status as ShelfStatus,
  currentPage: String(props.book.currentPage),
  totalPages: props.book.totalPages === null ? "" : String(props.book.totalPages),
  rating: props.book.rating,
  note: props.book.note ?? "",
});
watch(
  () => props.book,
  (book) => {
    draft.status = book.status;
    draft.currentPage = String(book.currentPage);
    draft.totalPages = book.totalPages === null ? "" : String(book.totalPages);
    draft.rating = book.rating;
    draft.note = book.note ?? "";
  },
  { deep: true },
);

function save() {
  const totalPages = draft.totalPages.trim() ? Number(draft.totalPages) : null;
  const currentPage = Number(draft.currentPage);
  if (!Number.isInteger(currentPage) || currentPage < 0) return;
  if (
    totalPages !== null &&
    (!Number.isInteger(totalPages) || totalPages < 1 || currentPage > totalPages)
  )
    return;
  const patch: Partial<
    Pick<ShelfBook, "status" | "totalPages" | "currentPage" | "rating" | "note">
  > = {};
  if (draft.status !== props.book.status) patch.status = draft.status;
  if (currentPage !== props.book.currentPage) patch.currentPage = currentPage;
  if (totalPages !== props.book.totalPages) patch.totalPages = totalPages;
  if (draft.rating !== props.book.rating) patch.rating = draft.rating;
  const note = draft.note.trim() || null;
  if (note !== props.book.note) patch.note = note;
  if (Object.keys(patch).length > 0) emit("save", props.book.id, patch);
}

function askRemove() {
  if (
    window.confirm(
      `Xóa “${props.book.title}” khỏi tủ sách? Tiến độ được lưu để khôi phục nếu thêm lại sau này.`,
    )
  )
    emit("remove", props.book);
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "short", year: "numeric" }).format(
        new Date(value),
      )
    : "";
}
</script>

<template>
  <article class="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
    <div class="flex gap-4 p-4 sm:gap-5 sm:p-5">
      <button
        class="w-24 shrink-0 text-left sm:w-28"
        :aria-label="`Mở chi tiết ${book.title}`"
        @click="emit('open', book)"
      >
        <BookCover :src="book.coverUrl" :title="book.title" />
      </button>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-medium text-stone-500">
              {{ book.firstPublishYear ?? "Tác phẩm"
              }}<span v-if="book.pageCountSource === 'MANUAL'"> · số trang tự nhập</span>
            </p>
            <button
              class="mt-1 text-left font-serif text-lg font-semibold leading-snug hover:text-emerald-900 sm:text-xl"
              @click="emit('open', book)"
            >
              {{ book.title }}
            </button>
            <p class="mt-1 line-clamp-1 text-sm text-stone-600">
              {{ book.authors.join(", ") || "Chưa rõ tác giả" }}
            </p>
          </div>
          <span
            class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
            :class="
              book.status === 'READ'
                ? 'bg-violet-100 text-violet-900'
                : book.status === 'READING'
                  ? 'bg-emerald-100 text-emerald-900'
                  : 'bg-amber-100 text-amber-900'
            "
            >{{ statusLabels[book.status] }}</span
          >
        </div>
        <div class="mt-4">
          <div class="mb-1.5 flex justify-between text-xs text-stone-500">
            <span>Tiến độ đọc</span
            ><span>{{
              book.totalPages
                ? `${book.currentPage} / ${book.totalPages} trang · ${book.progressPercent}%`
                : "Chưa có tổng số trang"
            }}</span>
          </div>
          <div
            class="h-2 overflow-hidden rounded-full bg-stone-100"
            role="progressbar"
            :aria-valuenow="book.progressPercent ?? 0"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="`Tiến độ ${book.title}`"
          >
            <div
              class="h-full rounded-full bg-emerald-700 transition-all"
              :style="{ width: `${book.progressPercent ?? 0}%` }"
            ></div>
          </div>
        </div>
        <div
          v-if="book.startedAt || book.finishedAt"
          class="mt-2 flex flex-wrap gap-x-4 text-[11px] text-stone-500"
        >
          <span v-if="book.startedAt">Bắt đầu {{ formatDate(book.startedAt) }}</span
          ><span v-if="book.finishedAt">Hoàn thành {{ formatDate(book.finishedAt) }}</span>
        </div>
      </div>
    </div>

    <div class="border-t border-stone-100 bg-stone-50/70 px-4 py-4 sm:px-5">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label class="field-label"
          >Trạng thái
          <select v-model="draft.status" class="field-input mt-1">
            <option v-for="option in statusOptions" :key="option" :value="option">
              {{ statusLabels[option] }}
            </option>
          </select>
        </label>
        <label class="field-label"
          >Trang hiện tại
          <input
            v-model="draft.currentPage"
            class="field-input mt-1"
            type="number"
            min="0"
            :max="draft.totalPages || undefined"
            step="1"
            inputmode="numeric"
          />
        </label>
        <label class="field-label"
          >Tổng số trang
          <input
            v-model="draft.totalPages"
            class="field-input mt-1"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            placeholder="Chưa biết"
          />
        </label>
        <div class="field-label">
          Đánh giá
          <div
            class="mt-1 flex h-10 items-center gap-1"
            role="group"
            aria-label="Đánh giá từ 1 đến 5 sao"
          >
            <button
              v-for="star in 5"
              :key="star"
              class="rounded p-1 text-xl leading-none transition hover:scale-110"
              :class="(draft.rating ?? 0) >= star ? 'text-amber-500' : 'text-stone-300'"
              :aria-label="`${star} sao`"
              :aria-pressed="draft.rating === star"
              @click="draft.rating = draft.rating === star ? null : star"
            >
              ★
            </button>
          </div>
        </div>
      </div>
      <label class="field-label mt-3 block"
        >Ghi chú
        <textarea
          v-model="draft.note"
          class="field-input mt-1 min-h-20 resize-y"
          maxlength="1000"
          placeholder="Một vài dòng cảm nhận của bạn…"
        ></textarea>
      </label>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button
          class="text-sm font-medium text-rose-700 hover:text-rose-900"
          :disabled="deleting"
          @click="askRemove"
        >
          {{ deleting ? "Đang xóa…" : "Xóa khỏi tủ" }}
        </button>
        <button class="button-primary" :disabled="saving" @click="save">
          {{ saving ? "Đang lưu…" : "Lưu thay đổi" }}
        </button>
      </div>
    </div>
  </article>
</template>
