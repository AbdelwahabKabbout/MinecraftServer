<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { RouterLink, RouterView } from "vue-router";
import { useSystemStore } from "@/stores/system";

const system = useSystemStore();

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: "▦" },
  { to: "/servers", label: "Servers", icon: "⬢" },
  { to: "/modpacks", label: "Modpacks", icon: "▤" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

onMounted(() => {
  void system.checkHealth();
  system.startStatusPolling(10_000);
});

onBeforeUnmount(() => {
  system.stopStatusPolling();
});
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <aside class="flex w-56 shrink-0 flex-col border-r border-surface-800 bg-surface-900">
      <div class="flex items-center gap-2 px-4 py-5">
        <div class="flex h-8 w-8 items-center justify-center rounded-md bg-accent-500 text-sm font-bold text-white">
          M
        </div>
        <div class="leading-tight">
          <div class="text-sm font-semibold text-slate-100">Minecraft</div>
          <div class="text-xs text-slate-400">Server Manager</div>
        </div>
      </div>

      <nav class="flex-1 space-y-1 px-2 py-2">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-surface-800 hover:text-slate-100"
          active-class="!bg-surface-800 !text-accent-400 font-medium"
        >
          <span class="w-4 text-center">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="border-t border-surface-800 px-4 py-3">
        <div class="flex items-center gap-2 text-xs">
          <span
            class="inline-block h-2 w-2 rounded-full"
            :class="system.backendHealthy ? 'bg-emerald-400' : 'bg-rose-500'"
          />
          <span class="text-slate-400">Backend</span>
          <span class="ml-auto font-mono" :title="system.backendError ?? ''">
            {{ system.backendHealthy ? `v${system.backendVersion ?? "?"}` : "offline" }}
          </span>
        </div>
      </div>
    </aside>

    <main class="flex-1 overflow-y-auto p-6">
      <RouterView />
    </main>
  </div>
</template>