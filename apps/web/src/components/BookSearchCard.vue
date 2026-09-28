<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { BookSearchItem } from "../lib/api";
import BookCover from "./BookCover.vue";

defineProps<{ book: BookSearchItem; adding?: boolean }>();
defineEmits<{ add: [workId: string] }>();
</script>

<template>
  <article
    class="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4"
  >
    <RouterLink
      :to="`/books/${book.workId}`"
      class="block"
      :aria-label="`Xem chi tiết ${book.title}`"
    >
      <BookCover :src="book.coverUrl" :title="book.title" />
    </RouterLink>
    <div class="flex flex-1 flex-col pt-3">
      <p v-if="book.firstPublishYear" class="text-xs font-medium text-stone-500">
        {{ book.firstPublishYear }}
      </p>
      <RouterLink
        :to="`/books/${book.workId}`"
        class="mt-1 line-clamp-2 font-serif text-base font-semibold leading-snug text-stone-900 hover:text-emerald-900 sm:text-lg"
      >
        {{ book.title }}
      </RouterLink>
      <p class="mt-1 line-clamp-2 min-h-9 text-sm text-stone-600">
        {{ book.authors.join(", ") || "Chưa rõ tác giả" }}
      </p>
      <div class="mt-auto pt-4">
        <span
          v-if="book.inShelf"
          class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-900"
        >
          <span aria-hidden="true">✓</span> Đã thêm
        </span>
        <button
          v-else
          class="button-secondary w-full"
          :disabled="adding"
          @click="$emit('add', book.workId)"
        >
          <span aria-hidden="true">{{ adding ? "…" : "+" }}</span>
          {{ adding ? "Đang thêm" : book.hasArchivedProgress ? "Khôi phục vào tủ" : "Thêm vào tủ" }}
        </button>
      </div>
    </div>
  </article>
</template>
