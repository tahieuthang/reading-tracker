<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{ src: string | null; title: string; compact?: boolean }>();
const failed = ref(false);
watch(
  () => props.src,
  () => (failed.value = false),
);
</script>

<template>
  <div
    class="cover-frame"
    :class="compact ? 'aspect-[3/4] w-24 shrink-0 sm:w-28' : 'aspect-[3/4] w-full'"
  >
    <img
      v-if="src && !failed"
      :src="src"
      :alt="`Bìa sách ${title}`"
      loading="lazy"
      @error="failed = true"
    />
    <div v-else class="cover-placeholder" aria-label="Chưa có ảnh bìa">
      <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/75"
        >Reading Room</span
      >
      <span class="mt-3 line-clamp-4 font-serif text-sm leading-5 text-white sm:text-base">{{
        title
      }}</span>
      <span class="mt-auto text-xs text-emerald-100/70">◇</span>
    </div>
  </div>
</template>
