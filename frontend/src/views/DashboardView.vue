<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useSystemStore } from "@/stores/system";

const system = useSystemStore();

onMounted(() => {
  void system.checkHealth();
});

onBeforeUnmount(() => {
  system.stopStatusPolling();
});
</script>

<template>
  <div class="space-y-6">
    <header>
      <h1 class="text-2xl font-semibold text-slate-100">Dashboard</h1>
      <p class="mt-1 text-sm text-slate-400">Overview of the Minecraft Server Manager.</p>
    </header>

    <div class="grid gap-4 md:grid-cols-3">
      <div class="rounded-lg border border-surface-800 bg-surface-900 p-4">
        <div class="text-xs uppercase tracking-wider text-slate-500">Backend</div>
        <div class="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-100">
          <span class="h-2.5 w-2.5 rounded-full" :class="system.backendHealthy ? 'bg-emerald-400' : 'bg-rose-500'" />
          {{ system.backendHealthy ? "Online" : "Offline" }}
        </div>
        <div class="mt-1 text-xs text-slate-500" v-if="system.backendHealthy">
          API v{{ system.backendVersion }} · SQLite {{ system.sqliteVersion }}
        </div>
        <div class="mt-1 text-xs text-slate-500" v-else>{{ system.backendError }}</div>
      </div>

      <div class="rounded-lg border border-surface-800 bg-surface-900 p-4">
        <div class="text-xs uppercase tracking-wider text-slate-500">Servers</div>
        <div class="mt-2 text-lg font-semibold text-slate-100">No servers registered</div>
        <div class="mt-1 text-xs text-slate-500">Server management arrives in the next milestone.</div>
      </div>

      <div class="rounded-lg border border-surface-800 bg-surface-900 p-4">
        <div class="text-xs uppercase tracking-wider text-slate-500">Modpacks</div>
        <div class="mt-2 text-lg font-semibold text-slate-100">No modpacks yet</div>
        <div class="mt-1 text-xs text-slate-500">Modpack tooling arrives in a later milestone.</div>
      </div>
    </div>

    <div class="rounded-lg border border-surface-800 bg-surface-900 p-5">
      <h2 class="text-sm font-semibold text-slate-200">Getting started</h2>
      <ol class="mt-3 space-y-2 text-sm text-slate-400">
        <li>1. Install a Java-compatible Minecraft server into <code class="rounded bg-surface-800 px-1 font-mono">servers/</code>.</li>
        <li>2. Wait for the server management milestone to register and control instances.</li>
        <li>3. Start, monitor and configure your instances from this dashboard.</li>
      </ol>
    </div>
  </div>
</template>