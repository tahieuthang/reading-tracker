<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { ShelfBook, ShelfStatus } from "../lib/api";
import { statusLabels, statusOptions } from "../lib/api";
import AppAlert from "./AppAlert.vue";
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
const alertMessage = ref("");
const alertTitle = ref("Thông báo");
const noteEditing = ref(false);
const pageCountLocked = computed(() => props.book.pageCountSource === "EDITION");

const draft = reactive({
  status: props.book.status as ShelfStatus,
  currentPage: String(props.book.currentPage),
  totalPages: props.book.totalPages === null ? "" : String(props.book.totalPages),
  rating: props.book.rating,
  note: props.book.note ?? "",
});
const hasChanges = computed(() => {
  const currentPageInput = draft.currentPage.trim();
  const currentPage = Number(currentPageInput);
  const totalPagesInput = draft.totalPages.trim();
  const totalPages = totalPagesInput ? Number(totalPagesInput) : null;
  const note = draft.note.trim() || null;

  return (
    draft.status !== props.book.status ||
    !currentPageInput ||
    !Number.isInteger(currentPage) ||
    currentPage !== props.book.currentPage ||
    (!pageCountLocked.value &&
      ((totalPagesInput !== "" && (!Number.isInteger(totalPages) || (totalPages ?? 0) < 1)) ||
        totalPages !== props.book.totalPages)) ||
    draft.rating !== props.book.rating ||
    note !== props.book.note
  );
});
watch(
  () => props.book,
  (book) => {
    noteEditing.value = false;
    draft.status = book.status;
    draft.currentPage = String(book.currentPage);
    draft.totalPages = book.totalPages === null ? "" : String(book.totalPages);
    draft.rating = book.rating;
    draft.note = book.note ?? "";
  },
  { deep: true },
);
watch(() => [draft.currentPage, draft.totalPages], syncStatusFromProgress, { flush: "post" });

function save() {
  const currentPageInput = draft.currentPage.trim();
  const totalPagesInput = draft.totalPages.trim();
  const totalPages = totalPagesInput ? Number(totalPagesInput) : null;
  const currentPage = Number(currentPageInput);
  if (!currentPageInput || !Number.isInteger(currentPage) || currentPage < 0) {
    showAlert("Trang hiện tại phải là số nguyên không âm.", "Dữ liệu chưa hợp lệ");
    return;
  }
  if (totalPages === null && currentPage > 0) {
    showAlert("Hãy nhập tổng số trang trước khi cập nhật trang hiện tại.", "Dữ liệu chưa hợp lệ");
    return;
  }
  if (
    totalPages !== null &&
    (!Number.isInteger(totalPages) || totalPages < 1 || currentPage > totalPages)
  ) {
    showAlert(
      "Trang hiện tại phải nằm trong khoảng từ 0 đến tổng số trang.",
      "Dữ liệu chưa hợp lệ",
    );
    return;
  }
  if (draft.status === "READING" && totalPages !== null && currentPage === totalPages) {
    showAlert(
      "Hãy giảm trang hiện tại xuống dưới trang cuối trước khi chuyển sang Đang đọc.",
      "Không thể đổi trạng thái",
    );
    return;
  }
  if (pageCountLocked.value && totalPages !== props.book.totalPages) {
    showAlert("Tổng số trang lấy từ Open Library không thể chỉnh sửa.", "Không thể cập nhật");
    return;
  }
  const patch: Partial<
    Pick<ShelfBook, "status" | "totalPages" | "currentPage" | "rating" | "note">
  > = {};
  if (draft.status !== props.book.status) patch.status = draft.status;
  if (currentPage !== props.book.currentPage) patch.currentPage = currentPage;
  if (!pageCountLocked.value && totalPages !== props.book.totalPages) patch.totalPages = totalPages;
  if (draft.rating !== props.book.rating) patch.rating = draft.rating;
  const note = draft.note.trim() || null;
  if (note !== props.book.note) patch.note = note;
  if (Object.keys(patch).length > 0) emit("save", props.book.id, patch);
}

function showAlert(message: string, title = "Thông báo") {
  alertTitle.value = title;
  alertMessage.value = message;
}

function onCurrentPageInput(event: Event) {
  draft.currentPage = (event.target as HTMLInputElement).value;
}

function onTotalPagesInput(event: Event) {
  draft.totalPages = (event.target as HTMLInputElement).value;
}

function syncStatusFromProgress() {
  const currentPageInput = draft.currentPage.trim();
  if (!currentPageInput) return;

  const page = Number(draft.currentPage);
  if (!Number.isInteger(page) || page < 0) return;

  if (page === 0) {
    draft.status = "WANT_TO_READ";
    return;
  }

  const totalPages = draft.totalPages.trim() ? Number(draft.totalPages) : null;
  if (totalPages === null || !Number.isInteger(totalPages) || totalPages < 1) return;

  if (page === totalPages) draft.status = "READ";
  else if (page < totalPages) draft.status = "READING";
}

function onStatusChange(event: Event) {
  const select = event.target as HTMLSelectElement;
  const selected = select.value as ShelfStatus;
  const currentPage = Number(draft.currentPage);
  const totalPages = draft.totalPages.trim() ? Number(draft.totalPages) : null;
  const hasPartialProgress =
    Number.isInteger(currentPage) &&
    currentPage > 0 &&
    (totalPages === null || currentPage < totalPages);

  if (selected === "WANT_TO_READ" && draft.status === "READING" && hasPartialProgress) {
    showAlert(
      "Bạn không thể chuyển sách về “Muốn đọc” khi trang hiện tại lớn hơn 0 và chưa đến trang cuối. Hãy tiếp tục cập nhật tiến độ, hoặc đặt trang hiện tại về 0 trước.",
      "Không thể đổi trạng thái",
    );
    draft.status = props.book.status;
    select.value = props.book.status;
    return;
  }

  if (selected === "READING" && totalPages !== null && currentPage === totalPages) {
    showAlert(
      "Hãy giảm trang hiện tại xuống dưới trang cuối trước khi chuyển sang Đang đọc.",
      "Không thể đổi trạng thái",
    );
    draft.status = props.book.status;
    select.value = props.book.status;
    return;
  }

  draft.status = selected;
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
              }}<span v-if="book.pageCountSource === 'EDITION'"> · theo ấn bản Open Library</span
              ><span v-else-if="book.pageCountSource === 'MANUAL'"> · số trang tự nhập</span>
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
          <select :value="draft.status" class="field-input mt-1" @change="onStatusChange">
            <option v-for="option in statusOptions" :key="option" :value="option">
              {{ statusLabels[option] }}
            </option>
          </select>
        </label>
        <label class="field-label"
          >Trang hiện tại
          <input
            :value="draft.currentPage"
            class="field-input mt-1"
            type="number"
            min="0"
            :max="draft.totalPages || undefined"
            step="1"
            inputmode="numeric"
            @input="onCurrentPageInput"
          />
        </label>
        <label class="field-label"
          >Tổng số trang
          <input
            :value="draft.totalPages"
            class="field-input mt-1"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            placeholder="Chưa biết"
            :disabled="pageCountLocked"
            :aria-describedby="pageCountLocked ? `page-count-lock-${book.id}` : undefined"
            @input="onTotalPagesInput"
          />
          <span
            v-if="pageCountLocked"
            :id="`page-count-lock-${book.id}`"
            class="mt-1 block text-xs font-normal text-stone-500"
            >Số trang do Open Library cung cấp</span
          >
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
        <div class="relative mt-1">
          <textarea
            v-model="draft.note"
            class="field-input min-h-20 resize-y pr-12"
            :class="noteEditing ? '' : 'bg-stone-100 text-stone-600'"
            :disabled="!noteEditing || saving"
            maxlength="1000"
            placeholder="Một vài dòng cảm nhận của bạn…"
          ></textarea>
          <button
            class="absolute right-2 top-2 rounded-md p-2 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900 disabled:cursor-wait disabled:opacity-50"
            type="button"
            :disabled="saving"
            :aria-label="noteEditing ? 'Khóa ghi chú' : 'Chỉnh sửa ghi chú'"
            :title="noteEditing ? 'Khóa ghi chú' : 'Chỉnh sửa ghi chú'"
            @click="noteEditing = !noteEditing"
          >
            <svg
              v-if="!noteEditing"
              class="h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M13.586 3.586a2 2 0 0 1 2.828 2.828l-8.5 8.5a2 2 0 0 1-.878.513l-3.2.914a.75.75 0 0 1-.927-.927l.914-3.2a2 2 0 0 1 .513-.878l8.5-8.5ZM12.172 5 5.397 11.775a.5.5 0 0 0-.128.22l-.58 2.032 2.032-.58a.5.5 0 0 0 .22-.128L13.716 6.54 12.172 5Z"
              />
            </svg>
            <svg
              v-else
              class="h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.26a1 1 0 0 1-1.42 0l-3.8-3.83a1 1 0 0 1 1.42-1.409l3.09 3.114 6.49-6.544a1 1 0 0 1 1.414-.005Z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
      </label>
      <div class="mt-3 flex flex-wrap items-center justify-end gap-3">
        <button
          class="button-primary inline-flex cursor-pointer items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="saving || !hasChanges"
          :aria-busy="saving"
          @click="save"
        >
          <svg
            v-if="saving"
            class="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>{{ saving ? "Đang lưu…" : "Lưu thay đổi" }}</span>
        </button>
        <button
          class="text-sm font-medium text-rose-700 hover:text-rose-900 cursor-pointer"
          :disabled="deleting"
          @click="askRemove"
        >
          {{ deleting ? "Đang xóa…" : "Xóa khỏi tủ" }}
        </button>
      </div>
    </div>

    <AppAlert :title="alertTitle" :message="alertMessage" @close="alertMessage = ''" />
  </article>
</template>
