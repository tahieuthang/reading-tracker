<script setup lang="ts">
import { RouterLink, useRoute } from "vue-router";

const route = useRoute();
</script>

<template>
  <div class="min-h-screen bg-[#f8f7f3] text-stone-900">
    <header class="sticky top-0 z-20 border-b border-stone-200/80 bg-[#f8f7f3]/95 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <RouterLink
          to="/"
          class="flex items-center gap-3"
          aria-label="Reading Room - trang tìm sách"
        >
          <span
            class="grid size-10 place-items-center rounded-2xl bg-emerald-900 text-lg text-amber-100 shadow-sm"
            >R</span
          >
          <span>
            <span class="block text-sm font-semibold tracking-wide">READING ROOM</span>
            <span class="hidden text-[11px] tracking-[0.16em] text-stone-500 sm:block"
              >YOUR PERSONAL LIBRARY</span
            >
          </span>
        </RouterLink>
        <nav
          class="flex items-center gap-1 rounded-full border border-stone-200 bg-white p-1 text-sm shadow-sm"
          aria-label="Điều hướng chính"
        >
          <RouterLink
            to="/"
            class="nav-link"
            :class="
              route.name === 'search' || route.name === 'book-detail' ? 'nav-link-active' : ''
            "
            >Khám phá</RouterLink
          >
          <RouterLink
            to="/shelf"
            class="nav-link"
            :class="route.name === 'shelf' ? 'nav-link-active' : ''"
            >Tủ sách</RouterLink
          >
        </nav>
      </div>
    </header>
    <main class="mx-auto min-h-[calc(100vh-70px)] max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
      <RouterView />
    </main>
    <footer class="border-t border-stone-200 px-4 py-5 text-center text-xs text-stone-500">
      Một góc nhỏ dành cho những cuốn sách bạn yêu thích.
    </footer>
  </div>
</template>
