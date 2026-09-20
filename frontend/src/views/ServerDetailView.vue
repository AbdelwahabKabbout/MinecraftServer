<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import StatusPill, { type PillStatus } from "@/components/StatusPill.vue";
import EmptyState from "@/components/EmptyState.vue";
import ConsolePanel from "@/components/ConsolePanel.vue";
import PropertiesPanel from "@/components/PropertiesPanel.vue";
import { useServersStore } from "@/stores/servers";
import type { DetectionReport, ManagedServer, ServerStatus } from "@/services/servers";

const route = useRoute();
const router = useRouter();
const store = useServersStore();

const serverId = computed(() => String(route.params.id));

const running = computed(() => {
  const s = store.byId(serverId.value);
  return !!s && (s.status === "STARTING" || s.status === "ONLINE" || s.status === "STOPPING");
});
const server = computed<ManagedServer | undefined>(() => store.byId(serverId.value));
const detection = computed<DetectionReport | undefined>(() => store.detections[serverId.value]);

const actionBusy = ref(false);

onMounted(() => {
  void store.fetchServer(serverId.value);
  void store.detect(serverId.value);
  store.connectLive();
});

onUnmounted(() => {
  store.disconnectLive();
});

watch(serverId, () => {
  void store.fetchServer(serverId.value);
  void store.detect(serverId.value);
});

function pillStatus(status: ServerStatus): PillStatus {
  return status.toLowerCase() as PillStatus;
}

async function refreshDetection(): Promise<void> {
  await store.detect(serverId.value);
}

async function runAction(action: "start" | "stop" | "restart"): Promise<void> {
  actionBusy.value = true;
  try {
    await store[action](serverId.value);
    if (action === "start") await store.detect(serverId.value);
  } finally {
    actionBusy.value = false;
  }
}

function goBack(): void {
  void router.push({ name: "servers" });
}

function blockerList(report: DetectionReport): string[] {
  return report.blockingMissing;
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <button class="text-sm text-slate-400 transition-colors hover:text-slate-200" @click="goBack">
      ← All servers
    </button>

    <div v-if="server" class="rounded-xl border border-surface-700 bg-surface-900 p-5">
      <header class="flex items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-semibold text-slate-100">{{ server.name }}</h1>
            <StatusPill :status="pillStatus(server.status)" />
          </div>
          <p class="mt-1 font-mono text-xs text-slate-500">
            {{ server.serverDirectory }} · {{ server.loader }}{{ server.loaderVersion ? ` ${server.loaderVersion}` : "" }}
            {{ server.minecraftVersion ? ` · MC ${server.minecraftVersion}` : "" }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="running"
            class="rounded-md bg-surface-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-surface-700 disabled:opacity-50"
            :disabled="actionBusy"
            @click="runAction('stop')"
          >
            Stop
          </button>
          <button
            v-if="running"
            class="rounded-md bg-surface-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-surface-700 disabled:opacity-50"
            :disabled="actionBusy"
            @click="runAction('restart')"
          >
            Restart
          </button>
          <button
            v-if="!running"
            class="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
            :disabled="actionBusy"
            @click="runAction('start')"
          >
            Start
          </button>
        </div>
      </header>

      <dl class="mt-5 grid grid-cols-2 gap-4 border-t border-surface-700 pt-4 text-sm sm:grid-cols-4">
        <div>
          <dt class="text-xs uppercase tracking-wide text-slate-500">Port</dt>
          <dd class="mt-1 text-slate-200">{{ server.port }}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-slate-500">Heap</dt>
          <dd class="mt-1 text-slate-200">{{ server.memoryMinMb }}–{{ server.memoryMaxMb }} MB</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-slate-500">Java</dt>
          <dd class="mt-1 font-mono text-xs text-slate-300">{{ server.javaPath }}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-slate-500">Updated</dt>
          <dd class="mt-1 text-slate-300">{{ new Date(server.updatedAt).toLocaleString() }}</dd>
        </div>
      </dl>
    </div>

    <div v-else class="rounded-xl border border-surface-700 bg-surface-900">
      <EmptyState icon="⬢" title="Server not found" description="It may have been deleted from another window." />
    </div>

    <section class="rounded-xl border border-surface-700 bg-surface-900 p-5">
      <header class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-slate-100">Server files</h2>
        <button class="rounded-md bg-surface-800 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-surface-700" @click="refreshDetection">
          Re-detect
        </button>
      </header>

      <template v-if="detection">
        <div v-if="detection.blockingMissing.length > 0" class="mt-4 rounded-md bg-rose-500/10 px-3 py-3">
          <p class="text-sm font-medium text-rose-300">The server cannot start until these are fixed:</p>
          <ul class="mt-1 ml-4 list-disc text-sm text-rose-200/90">
            <li v-for="item in blockerList(detection)" :key="item">{{ item }}</li>
          </ul>
        </div>
        <p v-else class="mt-4 rounded-md bg-emerald-500/10 px-3 py-3 text-sm text-emerald-300">
          The directory looks ready to launch.
        </p>

        <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-500">Launch jar</dt>
            <dd class="mt-1 break-all font-mono text-xs text-slate-300">{{ detection.serverJar ?? "—" }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-500">eula.txt</dt>
            <dd class="mt-1" :class="detection.eulaAgreed ? 'text-emerald-300' : 'text-rose-300'">
              {{ detection.eulaAgreed ? "accepted" : detection.eulaPresent ? "not accepted" : "missing" }}
            </dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-500">server.properties</dt>
            <dd class="mt-1" :class="detection.hasServerProperties ? 'text-slate-300' : 'text-amber-300'">
              {{ detection.hasServerProperties ? "present" : "will be created" }}
            </dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-500">mods/</dt>
            <dd class="mt-1 text-slate-300">{{ detection.hasModsDir ? "present" : "—" }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-500">world/</dt>
            <dd class="mt-1 text-slate-300">{{ detection.hasWorldDir ? "present" : "—" }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-500">logs/ · crash-reports/</dt>
            <dd class="mt-1 text-slate-300">{{ detection.hasLogsDir ? "logs present" : "—" }}{{ detection.hasCrashReportsDir ? " · crashes present" : "" }}</dd>
          </div>
        </dl>

<p v-if="detection.notes.length > 0" class="mt-4 border-t border-surface-700 pt-3 text-xs text-slate-500">
          {{ detection.notes.join(" ") }}
        </p>
      </template>
      <p v-else class="mt-4 text-sm text-slate-400">Running detection…</p>
    </section>

    <PropertiesPanel v-if="server" :server-id="server.id" />

    <ConsolePanel v-if="server" :server-id="server.id" :running="running" />
  </div>
</template>