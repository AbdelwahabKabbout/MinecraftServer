<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { serverService, type ServerNetworkReport } from "@/services/servers";
import { ApiClientError } from "@/services/api";

const props = defineProps<{ serverId: string }>();

const report = ref<ServerNetworkReport | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    report.value = await serverService.network(props.serverId);
  } catch (err) {
    error.value = err instanceof ApiClientError ? err.message : "Failed to load network info.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.serverId, load);

function schemeLabel(host: string): string {
  if (host === "127.0.0.1" || host.startsWith("localhost")) return "This machine";
  return "LAN";
}

let copyTimer = 0;
const copiedHost = ref<string | null>(null);

async function copyAddress(host: string, port: number): Promise<void> {
  await navigator.clipboard.writeText(`${host}:${port}`);
  copiedHost.value = host;
  window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => (copiedHost.value = null), 1200);
}
</script>

<template>
  <div class="rounded-xl border border-surface-700 bg-surface-900 p-5">
    <header class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-slate-100">Network access</h2>
        <p class="mt-1 text-sm text-slate-400">Connection addresses clients use to join this server.</p>
      </div>
      <button
        class="rounded-md bg-surface-800 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-surface-700"
        :disabled="loading"
        @click="load"
      >
        {{ loading ? "Refreshing…" : "Refresh" }}
      </button>
    </header>

    <p v-if="error" class="mt-4 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{{ error }}</p>

    <template v-else-if="report">
      <div
        class="mt-4 flex items-center gap-2 text-sm"
        :class="report.usable ? 'text-emerald-300' : 'text-rose-300'"
      >
        <span class="size-2 rounded-full" :class="report.usable ? 'bg-emerald-400' : 'bg-rose-400'"></span>
        {{ report.label }}
      </div>
      <p class="mt-2 text-sm text-slate-400">{{ report.note }}</p>

      <ul class="mt-4 space-y-2">
        <li
          v-for="address in report.addresses"
          :key="address.host"
          class="flex items-center justify-between rounded-md bg-surface-800/60 px-3 py-2"
        >
          <div class="flex items-center gap-3">
            <code class="font-mono text-sm text-slate-200">{{ address.host }}:{{ address.port }}</code>
            <span v-if="copiedHost === address.host" class="text-xs text-emerald-300">copied</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="rounded-full bg-surface-700 px-2 py-0.5 text-xs text-slate-400">{{ schemeLabel(address.host) }}</span>
            <button
              class="rounded bg-surface-800 px-2 py-0.5 text-xs text-slate-400 transition-colors hover:text-slate-200"
              @click="copyAddress(address.host, address.port)"
            >
              Copy
            </button>
          </div>
        </li>
      </ul>
      <p v-if="report.addresses.length === 0" class="mt-4 text-sm text-slate-500">No addresses detected on this host.</p>
    </template>
    <p v-else class="mt-4 text-sm text-slate-500">Loading…</p>
  </div>
</template>