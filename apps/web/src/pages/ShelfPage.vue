<script setup lang="ts">
import { computed, ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { useRouter } from "vue-router";
import ShelfBookCard from "../components/ShelfBookCard.vue";
import { api, statusLabels, statusOptions, type ShelfBook, type ShelfStatus } from "../lib/api";

const client = useQueryClient();
const router = useRouter();
const activeStatus = ref<ShelfStatus>("WANT_TO_READ");
const notice = ref("");
const stats = useQuery({ queryKey: ["shelf-stats"], queryFn: api.getShelfStats });
const shelf = useQuery({
  queryKey: computed(() => ["shelf", activeStatus.value]),
  queryFn: () => api.getShelf(activeStatus.value),
});
const statsData = computed(() => stats.data.value);
const statsError = computed(() => stats.error.value);
const statsFailed = computed(() => stats.isError.value);
const shelfData = computed(() => shelf.data.value);
const shelfItems = computed(() => shelfData.value ?? []);
const shelfError = computed(() => shelf.error.value);
const shelfPending = computed(() => shelf.isPending.value);
const shelfFailed = computed(() => shelf.isError.value);
const updateBusy = computed(() => updateMutation.isPending.value);
const updateTarget = computed(() => updateMutation.variables.value?.id);
const removeBusy = computed(() => removeMutation.isPending.value);
const removeTarget = computed(() => removeMutation.variables.value);
const statusCounts = computed<Record<ShelfStatus, number>>(() => ({
  WANT_TO_READ: Math.max(
    0,
    (statsData.value?.totalBooks ?? 0) -
      (statsData.value?.readingBooks ?? 0) -
      (statsData.value?.readBooks ?? 0),
  ),
  READING: statsData.value?.readingBooks ?? 0,
  READ: statsData.value?.readBooks ?? 0,
}));

const updateMutation = useMutation({
  mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateShelfBook>[1] }) =>
    api.updateShelfBook(id, patch),
  onSuccess: async () => {
    notice.value = "Đã lưu cập nhật sách.";
    await invalidateShelf();
  },
  onError: (error) =>
    (notice.value = error instanceof Error ? error.message : "Không thể lưu thay đổi."),
});

const removeMutation = useMutation({
  mutationFn: (id: string) => api.removeFromShelf(id),
  onSuccess: async () => {
    notice.value = "Đã xóa sách khỏi tủ. Tiến độ được giữ lại nếu bạn muốn thêm lại sau này.";
    await invalidateShelf();
  },
  onError: (error) =>
    (notice.value = error instanceof Error ? error.message : "Không thể xóa sách."),
});

async function invalidateShelf() {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["shelf"] }),
    client.invalidateQueries({ queryKey: ["shelf-stats"] }),
    client.invalidateQueries({ queryKey: ["books"] }),
    client.invalidateQueries({ queryKey: ["book"] }),
  ]);
}

function save(id: string, patch: Parameters<typeof api.updateShelfBook>[1]) {
  notice.value = "";
  updateMutation.mutate({ id, patch });
}

function remove(book: ShelfBook) {
  notice.value = "";
  removeMutation.mutate(book.id);
}
</script>

<template>
  <section>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="section-eyebrow">Không gian của bạn</p>
        <h1 class="mt-2 font-serif text-4xl text-stone-900 sm:text-5xl">Tủ sách của tôi</h1>
        <p class="mt-3 max-w-xl text-sm leading-6 text-stone-600">
          Theo dõi từng cuốn sách, lưu lại suy nghĩ và tiếp tục từ đúng trang bạn đã dừng.
        </p>
      </div>
      <RouterLink to="/" class="button-primary">+ Khám phá sách</RouterLink>
    </div>

    <div class="mt-8 grid gap-3 sm:grid-cols-3">
      <article class="stat-card">
        <span class="stat-icon bg-amber-100 text-amber-900">▤</span>
        <div>
          <p class="text-sm text-stone-500">Tổng số sách</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums">
            {{ statsData?.totalBooks ?? "—" }}
          </p>
        </div>
      </article>
      <article class="stat-card">
        <span class="stat-icon bg-emerald-100 text-emerald-900">◷</span>
        <div>
          <p class="text-sm text-stone-500">Đang đọc</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums">
            {{ statsData?.readingBooks ?? "—" }}
          </p>
        </div>
      </article>
      <article class="stat-card">
        <span class="stat-icon bg-violet-100 text-violet-900">✓</span>
        <div>
          <p class="text-sm text-stone-500">Đã đọc xong</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums">{{ statsData?.readBooks ?? "—" }}</p>
        </div>
      </article>
    </div>
    <div
      v-if="statsFailed"
      class="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800"
      role="alert"
    >
      Chưa tải được thống kê: {{ statsError?.message }}
      <button class="ml-2 font-semibold underline" @click="stats.refetch()">Thử lại</button>
    </div>

    <div class="mt-9 border-b border-stone-200">
      <div
        class="flex gap-1 overflow-x-auto"
        role="tablist"
        aria-label="Lọc tủ sách theo trạng thái"
      >
        <button
          v-for="status in statusOptions"
          :key="status"
          class="shelf-tab"
          :class="activeStatus === status ? 'shelf-tab-active' : ''"
          role="tab"
          :aria-selected="activeStatus === status"
          @click="
            activeStatus = status;
            notice = '';
          "
        >
          {{ statusLabels[status] }}
          <span
            class="ml-1 rounded-full px-2 py-0.5 text-xs"
            :class="activeStatus === status ? 'bg-white/70' : 'bg-stone-100'"
            >{{ statusCounts[status] }}</span
          >
        </button>
      </div>
    </div>

    <div
      v-if="notice"
      class="mt-4 flex items-start justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      role="status"
    >
      <span>{{ notice }}</span
      ><button class="text-lg leading-none" aria-label="Đóng thông báo" @click="notice = ''">
        ×
      </button>
    </div>

    <div v-if="shelfPending" class="mt-5 space-y-4">
      <div
        v-for="index in 3"
        :key="index"
        class="h-56 animate-pulse rounded-2xl bg-stone-200"
      ></div>
    </div>
    <div v-else-if="shelfFailed" class="state-panel mt-5" role="alert">
      <span class="state-icon">!</span>
      <h2 class="mt-3 font-serif text-xl">Chưa tải được tủ sách</h2>
      <p class="mt-2 text-sm text-stone-600">{{ shelfError?.message }}</p>
      <button class="button-secondary mt-5" @click="shelf.refetch()">Thử lại</button>
    </div>
    <div v-else-if="shelfData?.length === 0" class="state-panel mt-5">
      <span class="state-icon">✧</span>
      <h2 class="mt-3 font-serif text-2xl">
        {{
          activeStatus === "WANT_TO_READ"
            ? "Danh sách đang chờ cuốn đầu tiên"
            : `Chưa có sách ${statusLabels[activeStatus].toLowerCase()}`
        }}
      </h2>
      <p class="mt-2 max-w-md text-sm leading-6 text-stone-600">
        {{
          activeStatus === "WANT_TO_READ"
            ? "Tìm một cuốn sách khiến bạn tò mò và thêm vào tủ nhé."
            : "Khi bạn cập nhật trạng thái sách, chúng sẽ xuất hiện ở đây."
        }}
      </p>
      <RouterLink to="/" class="button-primary mt-5">Tìm sách</RouterLink>
    </div>
    <div v-else class="mt-5 space-y-4">
      <ShelfBookCard
        v-for="book in shelfItems"
        :key="book.id"
        :book="book"
        :saving="updateBusy && updateTarget === book.id"
        :deleting="removeBusy && removeTarget === book.id"
        @save="save"
        @remove="remove"
        @open="router.push(`/books/${$event.workId}`)"
      />
    </div>
  </section>
</template>
