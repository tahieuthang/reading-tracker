<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";

const props = withDefaults(
  defineProps<{ message: string; title?: string; durationMs?: number }>(),
  { title: "Thông báo", durationMs: 5000 },
);
const emit = defineEmits<{ close: [] }>();

let timeoutId: ReturnType<typeof setTimeout> | undefined;
watch(
  () => props.message,
  (message) => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (message) timeoutId = setTimeout(() => emit("close"), props.durationMs);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (timeoutId !== undefined) clearTimeout(timeoutId);
});
</script>

<template>
  <div
    v-if="message"
    class="fixed right-4 top-4 z-[60] w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-stone-200 bg-white p-4 shadow-xl"
    role="alert"
    aria-live="assertive"
  >
    <div class="flex items-start gap-3">
      <span
        class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-900"
        aria-hidden="true"
        >!</span
      >
      <div class="min-w-0 flex-1">
        <p class="font-semibold text-stone-900">{{ title }}</p>
        <p class="mt-1 text-sm leading-5 text-stone-600">{{ message }}</p>
      </div>
      <button
        class="rounded p-1 text-lg leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-900"
        aria-label="Đóng thông báo"
        @click="emit('close')"
      >
        ×
      </button>
    </div>
  </div>
</template>
