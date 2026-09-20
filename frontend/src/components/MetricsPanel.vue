<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useServersStore } from "@/stores/servers";

const props = defineProps<{
  serverId: string;
  running: boolean;
}>();

const store = useServersStore();

const metrics = computed(() => store.metrics[props.serverId]);
const players = computed(() => store.players[props.serverId]);
const server = computed(() => store.byId(props.serverId));

const heapMaxMb = computed(() => server.value?.memoryMaxMb ?? 4096);

const cpuPercent = computed<number | null>(() => metrics.value?.snapshot?.cpuPercent ?? null);
const memoryMb = computed<number | null>(() => metrics.value?.snapshot?.memoryMb ?? null);
const lastSampleAt = computed<number | null>(() => metrics.value?.snapshot?.timestamp ?? null);

const memoryBar = computed(() => {
  const mb = memoryMb.value;
  if (mb === null) return 0;
  return Math.min(100, Math.round((mb / ((heapMaxMb.value * 1.2) || 1)) * 100));
});

const uptime = computed(() => {
  const startedAt = metrics.value?.startedAt;
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
});

const activity = computed(() => {
  const list = players.value?.activity.slice().reverse() ?? [];
  return list.slice(0, 50);
});

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

onMounted(() => {
  void store.fetchMetrics(props.serverId);
  void store.fetchPlayers(props.serverId);
});
</script>

<template>
  <section class="rounded-xl border border-surface-700 bg-surface-900 p-5">
    <header class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-slate-100">Monitoring</h2>
      <span v-if="metrics?.running" class="flex items-center gap-2 text-xs text-emerald-300">
        <span class="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span>
        sampling live
      </span>
      <span v-else class="text-xs text-slate-500">server offline</span>
    </header>

    <div v-if="metrics?.running" class="mt-4 grid grid-cols-2 gap-4">
      <div class="rounded-lg border border-surface-700 bg-surface-800/60 p-4">
        <p class="text-xs uppercase tracking-wide text-slate-500">CPU</p>
        <div class="mt-2 flex items-baseline gap-1">
          <span class="text-2xl font-semibold tabular-nums text-slate-100">{{ cpuPercent ?? "—" }}</span>
          <span class="text-sm text-slate-500">%</span>
        </div>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-surface-700">
          <div class="h-full rounded-full bg-sky-500 transition-all" :style="{ width: `${Math.min(100, cpuPercent ?? 0)}%` }"></div>
        </div>
      </div>

      <div class="rounded-lg border border-surface-700 bg-surface-800/60 p-4">
        <p class="text-xs uppercase tracking-wide text-slate-500">RAM</p>
        <div class="mt-2 flex items-baseline gap-1">
          <span class="text-2xl font-semibold tabular-nums text-slate-100">{{ memoryMb ?? "—" }}</span>
          <span class="text-sm text-slate-500">MB</span>
        </div>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-surface-700">
          <div class="h-full rounded-full bg-emerald-500 transition-all" :style="{ width: `${memoryBar}%` }"></div>
        </div>
      </div>
    </div>

    <div v-else class="mt-4 rounded-md bg-surface-800/60 px-3 py-6 text-center text-sm text-slate-500">
      Start the server to begin sampling CPU and RAM every 5 seconds.
    </div>

    <dl v-if="metrics?.running" class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-surface-700 pt-4 text-sm sm:grid-cols-3">
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">Uptime</dt>
        <dd class="mt-1 font-mono tabular-nums text-slate-300">{{ uptime ?? "—" }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">PID</dt>
        <dd class="mt-1 font-mono text-slate-300">{{ metrics.pid ?? "—" }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">Sample</dt>
        <dd class="mt-1 font-mono text-slate-300">{{ lastSampleAt ? new Date(lastSampleAt).toLocaleTimeString() : "—" }}</dd>
      </div>
    </dl>

    <div class="mt-5 border-t border-surface-700 pt-4">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium text-slate-300">Online players</h3>
        <span v-if="players?.running" class="text-xs text-slate-500">{{ players.online.length }} online</span>
      </div>

      <div v-if="players?.running && players.online.length > 0" class="mt-3 flex flex-wrap gap-2">
        <span v-for="name in players.online" :key="name" class="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300 ring-1 ring-emerald-500/30">
          {{ name }}
        </span>
      </div>
      <p v-else class="mt-3 text-sm text-slate-500">
        {{ props.running ? "No players online." : "Players appear while the server is running." }}
      </p>

      <ul v-if="activity.length > 0" class="mt-4 space-y-1.5">
        <li v-for="entry in activity" :key="`${entry.timestamp}:${entry.player}:${entry.action}`" class="flex items-center gap-2 text-xs">
          <span class="font-mono text-slate-600">{{ formatTime(entry.timestamp) }}</span>
          <span :class="entry.action === 'joined' ? 'text-emerald-300' : 'text-rose-300'">
            {{ entry.action === "joined" ? "→" : "←" }} {{ entry.player }}
          </span>
        </li>
      </ul>
    </div>
  </section>
</template>