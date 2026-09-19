import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/dashboard",
  },
  {
    path: "/dashboard",
    name: "dashboard",
    component: () => import("@/views/DashboardView.vue"),
    meta: { title: "Dashboard" },
  },
  {
    path: "/servers",
    name: "servers",
    component: () => import("@/views/ServersView.vue"),
    meta: { title: "Servers" },
  },
  {
    path: "/servers/:id",
    name: "server-detail",
    component: () => import("@/views/ServerDetailView.vue"),
    meta: { title: "Server" },
  },
  {
    path: "/modpacks",
    name: "modpacks",
    component: () => import("@/views/ModpacksView.vue"),
    meta: { title: "Modpacks" },
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/views/SettingsView.vue"),
    meta: { title: "Settings" },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("@/views/NotFoundView.vue"),
    meta: { title: "Not Found" },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.afterEach((to) => {
  const base = "Minecraft Server Manager";
  document.title = to.meta.title ? `${String(to.meta.title)} — ${base}` : base;
});