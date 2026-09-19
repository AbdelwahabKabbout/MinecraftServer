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
  <div class="mx-auto max-w-2xl space-y-6">
    <header>
      <h1 class="text-2xl font-semibold text-slate-100">Settings</h1>
      <p class="mt-1 text-sm text-slate-400">Application and environment settings.</p>
    </header>

    <div class="rounded-lg border border-surface-800 bg-surface-900 p-5">
      <h2 class="text-sm font-semibold text-slate-200">Manager</h2>
      <dl class="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-slate-500">API version</dt>
          <dd class="mt-0.5 font-mono text-slate-200">{{ system.backendVersion ?? "—" }}</dd>
        </div>
        <div>
          <dt class="text-slate-500">SQLite version</dt>
          <dd class="mt-0.5 font-mono text-slate-200">{{ system.sqliteVersion ?? "—" }}</dd>
        </div>
        <div>
          <dt class="text-slate-500">Backend status</dt>
          <dd class="mt-0.5" :class="system.backendHealthy ? 'text-emerald-400' : 'text-rose-400'">
            {{ system.backendHealthy ? "Connected" : (system.backendError ?? "Disconnected") }}
          </dd>
        </div>
        <div>
          <dt class="text-slate-500">Last health check</dt>
          <dd class="mt-0.5 text-slate-200">
            {{ system.lastCheckedAt ? new Date(system.lastCheckedAt).toLocaleTimeString() : "—" }}
          </dd>
        </div>
      </dl>
    </div>

    <div class="rounded-lg border border-surface-800 bg-surface-900 p-5">
      <h2 class="text-sm font-semibold text-slate-200">Environment</h2>
      <p class="mt-2 text-sm text-slate-400">
        Backend configuration lives in <code class="rounded bg-surface-800 px-1 font-mono">.env</code>.
        See the <code class="rounded bg-surface-800 px-1 font-mono">.env.example</code> file for available options.
      </p>
    </div>
  </div>
</template>