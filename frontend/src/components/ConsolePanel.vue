<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useServersStore } from "@/stores/servers";
import ConfirmDialog from "@/components/ConfirmDialog.vue";

const props = defineProps<{
  serverId: string;
  running: boolean;
}>();

const store = useServersStore();

const lines = computed(() => store.consoleById(props.serverId));
const logEl = ref<HTMLElement | null>(null);
const follow = ref(true);
const input = ref("");
const commandLog = ref<string[]>([]);
const historyIndex = ref(-1);
const draft = ref("");
const lastError = ref("");
const clearOpen = ref(false);
const clearing = ref(false);

onMounted(() => {
  void store.hydrateConsole(props.serverId);
});

watch(
  () => props.serverId,
  () => {
    void store.hydrateConsole(props.serverId);
    follow.value = true;
    lastError.value = "";
  },
);

watch(
  () => lines.value.length,
  async () => {
    if (!follow.value) return;
    await nextTick();
    const el = logEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
);

function onScroll(): void {
  const el = logEl.value;
  if (!el) return;
  follow.value = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
}

function jumpToBottom(): void {
  const el = logEl.value;
  if (el) el.scrollTop = el.scrollHeight;
  follow.value = true;
}

function stamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

function lineClass(line: string): string {
  if (line.startsWith("[manager]")) return "text-sky-300/80";
  if (/\b(ERROR|Exception|FATAL)\b/.test(line)) return "text-rose-300";
  if (/\bWARN(ING)?\b/.test(line)) return "text-amber-200/90";
  return "text-slate-300";
}

async function sendCommand(): Promise<void> {
  const command = input.value.trim();
  if (!command) return;
  lastError.value = "";
  const ok = await store.sendCommand(props.serverId, command);
  if (ok) {
    commandLog.value.unshift(command);
    historyIndex.value = -1;
    draft.value = "";
    input.value = "";
  } else {
    lastError.value = store.error ?? "Command failed.";
  }
}

function onInputKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter") {
    event.preventDefault();
    void sendCommand();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (commandLog.value.length === 0) return;
    if (historyIndex.value === -1) draft.value = input.value;
    historyIndex.value = Math.min(historyIndex.value + 1, commandLog.value.length - 1);
    input.value = commandLog.value[historyIndex.value] ?? "";
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    if (historyIndex.value === -1) return;
    historyIndex.value -= 1;
    input.value = historyIndex.value === -1 ? draft.value : (commandLog.value[historyIndex.value] ?? "");
  }
}

async function confirmClear(): Promise<void> {
  clearing.value = true;
  try {
    await store.clearConsole(props.serverId);
    clearOpen.value = false;
  } finally {
    clearing.value = false;
  }
}
</script>

<template>
  <section class="rounded-xl border border-surface-700 bg-surface-900 p-5">
    <header class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-semibold text-slate-100">Console</h2>
        <span
          class="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
          :class="running ? 'bg-emerald-500/15 text-emerald-300' : 'bg-surface-800 text-slate-500'"
        >
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="running && store.live ? 'animate-pulse bg-emerald-400' : 'bg-current'"
          ></span>
          {{ running && store.live ? "live" : running ? "connecting" : "offline" }}
        </span>
      </div>
      <button
        v-if="lines.length > 0"
        class="rounded-md bg-surface-800 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-surface-700"
        :disabled="clearing"
        @click="clearOpen = true"
      >
        Clear
      </button>
    </header>

    <div class="relative mt-3">
      <div
        ref="logEl"
        class="h-80 overflow-y-auto rounded-lg border border-surface-800 bg-black/50 p-3 font-mono text-xs leading-relaxed"
        @scroll="onScroll"
      >
        <div v-if="lines.length === 0" class="text-slate-600">
          {{ running ? "Waiting for output…" : "No console output yet. Start the server to see logs." }}
        </div>
        <div v-for="(entry, index) in lines" :key="index">
          <span class="select-none text-slate-600" :title="stamp(entry.timestamp)">{{ stamp(entry.timestamp) }}</span>
          <span class="ml-2 whitespace-pre-wrap break-words" :class="lineClass(entry.line)">{{ entry.line }}</span>
        </div>
      </div>

      <button
        v-if="!follow && lines.length > 0"
        class="absolute bottom-3 right-3 rounded-md border border-surface-600 bg-surface-800 px-3 py-1.5 text-xs text-slate-300 shadow-lg transition-colors hover:bg-surface-700"
        @click="jumpToBottom"
      >
        ↓ Jump to bottom
      </button>
    </div>

    <form class="mt-3 flex items-center gap-2" @submit.prevent="void sendCommand()">
      <span class="font-mono text-sm text-sky-400">›</span>
      <input
        v-model="input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :disabled="!running"
        :placeholder="running ? 'Type a command and press Enter (e.g. say hello)' : 'Start the server to send commands'"
        class="flex-1 rounded-md border border-surface-800 bg-surface-950 px-3 py-2 font-mono text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        @keydown="onInputKeydown"
      />
    </form>

    <p v-if="lastError" class="mt-2 text-xs text-rose-300">{{ lastError }}</p>

    <ConfirmDialog
      v-model="clearOpen"
      title="Clear console"
      message="This permanently removes the stored console history for this server. Live output keeps flowing if the server is running."
      confirm-label="Clear"
      danger
      :busy="clearing"
      @confirm="confirmClear"
    />
  </section>
</template>