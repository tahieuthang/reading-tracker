import { createRouter, createWebHistory } from "vue-router";
import BookDetailPage from "./pages/BookDetailPage.vue";
import SearchPage from "./pages/SearchPage.vue";
import ShelfPage from "./pages/ShelfPage.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "search", component: SearchPage },
    { path: "/books/:workId", name: "book-detail", component: BookDetailPage },
    { path: "/shelf", name: "shelf", component: ShelfPage },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
