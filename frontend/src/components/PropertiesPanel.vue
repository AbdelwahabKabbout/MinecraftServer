<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useServersStore } from "@/stores/servers";

interface PropertyField {
  key: string;
  label: string;
  type: "text" | "number" | "checkbox" | "select";
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  help?: string;
}

const FIELDS: PropertyField[] = [
  { key: "motd", label: "Message of the day", type: "text", placeholder: "A Minecraft Server", help: "Shown while hovering the server in the multiplayer list." },
  { key: "level-name", label: "World name / folder", type: "text", placeholder: "world" },
  { key: "level-seed", label: "World seed", type: "text", placeholder: "random" },
  { key: "server-ip", label: "Server IP (bind)", type: "text", placeholder: "all interfaces" },
  { key: "server-port", label: "Server port", type: "number", placeholder: "25565" },
  { key: "max-players", label: "Max players", type: "number", placeholder: "20" },
  { key: "view-distance", label: "View distance (chunks)", type: "number", placeholder: "10" },
  { key: "spawn-protection", label: "Spawn protection (radius)", type: "number", placeholder: "16" },
  { key: "max-tick-time", label: "Max tick time (ms, -1 = never)", type: "number", placeholder: "-1" },
  { key: "network-compression-threshold", label: "Packet compression (bytes)", type: "number", placeholder: "256", help: "-1 disables compression." },
  { key: "max-world-size", label: "Max world size", type: "number", placeholder: "29999984" },
  { key: "player-idle-timeout", label: "Idle kick (minutes, 0 = off)", type: "number", placeholder: "0" },
  { key: "difficulty", label: "Difficulty", type: "select", options: [
    { value: "peaceful", label: "Peaceful" },
    { value: "easy", label: "Easy" },
    { value: "normal", label: "Normal" },
    { value: "hard", label: "Hard" },
  ] },
  { key: "gamemode", label: "Default gamemode", type: "select", options: [
    { value: "survival", label: "Survival" },
    { value: "creative", label: "Creative" },
    { value: "adventure", label: "Adventure" },
    { value: "spectator", label: "Spectator" },
  ] },
  { key: "online-mode", label: "Online mode (Mojang auth)", type: "checkbox", help: "Off for offline / LAN play." },
  { key: "white-list", label: "Whitelist", type: "checkbox" },
  { key: "pvp", label: "PvP", type: "checkbox" },
  { key: "enable-command-block", label: "Enable command blocks", type: "checkbox" },
  { key: "allow-nether", label: "Allow the Nether", type: "checkbox" },
  { key: "allow-flight", label: "Allow flight", type: "checkbox" },
  { key: "force-gamemode", label: "Force default gamemode on join", type: "checkbox" },
  { key: "hardcore", label: "Hardcore", type: "checkbox", help: "Players are banned on death." },
  { key: "enforce-secure-profile", label: "Enforce secure profile", type: "checkbox" },
  { key: "hide-online-players", label: "Hide player list in status", type: "checkbox" },
  { key: "sync-chunk-writes", label: "Sync chunk writes", type: "checkbox" },
  { key: "prevent-proxy-connections", label: "Prevent proxy connections", type: "checkbox" },
  { key: "enable-status", label: "Expose status ping", type: "checkbox" },
  { key: "enable-query", label: "Enable GameSpy query", type: "checkbox" },
  { key: "enable-rcon", label: "Enable RCON", type: "checkbox" },
  { key: "rcon.port", label: "RCON port", type: "number", placeholder: "25575" },
  { key: "rcon.password", label: "RCON password", type: "text", placeholder: "(set to enable remote console)" },
];

const props = defineProps<{
  serverId: string;
}>();

const store = useServersStore();

const mode = ref<"form" | "raw">("form");
const form = ref<Record<string, string>>({});
const rawText = ref("");
const loading = ref(false);
const saving = ref(false);
const lastError = ref("");
const savedFlash = ref("");
let flashTimer: ReturnType<typeof setTimeout> | null = null;

const doc = computed(() => store.properties[props.serverId]);
const gridFields = computed(() => FIELDS.filter((f) => f.type !== "checkbox"));
const checkboxFields = computed(() => FIELDS.filter((f) => f.type === "checkbox"));

onMounted(() => {
  void load();
});

watch(
  () => props.serverId,
  () => {
    void load();
  },
);

function syncForm(): void {
  const current = new Map((doc.value?.pairs ?? []).map((p) => [p.key, p.value]));
  const next: Record<string, string> = {};
  for (const field of FIELDS) {
    const value = current.get(field.key);
    if (field.type === "checkbox") {
      next[field.key] = value !== undefined && value !== "false" ? "true" : "false";
    } else {
      next[field.key] = value ?? "";
    }
  }
  form.value = next;
  rawText.value = doc.value?.text ?? "";
}

async function load(): Promise<void> {
  loading.value = true;
  lastError.value = "";
  try {
    await store.fetchProperties(props.serverId);
  } finally {
    syncForm();
    loading.value = false;
  }
}

async function reload(): Promise<void> {
  if (saving.value) return;
  await load();
}

function buildValues(): Record<string, string | null> {
  const values: Record<string, string | null> = {};
  for (const field of FIELDS) {
    const raw = (form.value[field.key] ?? "").trim();
    if (field.type === "checkbox") {
      values[field.key] = raw === "true" ? "true" : "false";
    } else if (raw === "") {
      values[field.key] = null;
    } else {
      values[field.key] = raw;
    }
  }
  return values;
}

async function save(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  lastError.value = "";
  savedFlash.value = "";
  try {
    const payload = mode.value === "raw" ? { raw: rawText.value } : { values: buildValues() };
    const result = await store.saveProperties(props.serverId, payload);
    if (result) {
      rawText.value = result.text ?? "";
      savedFlash.value = `Saved ${new Date().toLocaleTimeString()}`;
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        savedFlash.value = "";
      }, 3000);
      void store.detect(props.serverId);
    }
  } catch (error) {
    lastError.value = store.messageFor(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="rounded-xl border border-surface-700 bg-surface-900 p-5">
    <header class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-semibold text-slate-100">Server properties</h2>
        <span class="font-mono text-xs text-slate-500">{{ doc?.path ?? "server.properties" }}</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex rounded-md bg-surface-800 p-0.5">
          <button
            class="rounded px-3 py-1 text-xs transition-colors"
            :class="mode === 'form' ? 'bg-surface-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
            @click="mode = 'form'"
          >
            Common
          </button>
          <button
            class="rounded px-3 py-1 text-xs transition-colors"
            :class="mode === 'raw' ? 'bg-surface-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
            @click="mode = 'raw'"
          >
            Raw
          </button>
        </div>
        <button
          class="rounded-md bg-surface-800 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-surface-700 disabled:opacity-50"
          :disabled="loading || saving"
          @click="reload"
        >
          Reload
        </button>
        <button
          class="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
          :disabled="loading || saving"
          @click="save"
        >
          {{ saving ? "Saving…" : "Save" }}
        </button>
      </div>
    </header>

    <p v-if="doc && !doc.exists" class="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
      No server.properties file exists yet — saving will create one.
    </p>

    <form v-if="mode === 'form'" class="mt-4" @submit.prevent="void save()">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label v-for="field in gridFields" :key="field.key" class="block text-sm">
          <span class="text-slate-400">{{ field.label }}</span>
          <select
            v-if="field.type === 'select'"
            v-model="form[field.key]"
            class="mt-1 block w-full rounded-md border border-surface-800 bg-surface-950 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-sky-500"
          >
            <option value="" class="bg-surface-900">(default)</option>
            <option v-for="option in field.options" :key="option.value" :value="option.value" class="bg-surface-900">
              {{ option.label }}
            </option>
          </select>
          <input
            v-else
            v-model="form[field.key]"
            :type="field.type"
            :placeholder="field.placeholder"
            class="mt-1 block w-full rounded-md border border-surface-800 bg-surface-950 px-3 py-2 font-mono text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-sky-500"
          />
          <span v-if="field.help" class="mt-1 block text-xs text-slate-500">{{ field.help }}</span>
        </label>
      </div>

      <div class="mt-5 rounded-lg border border-surface-800 bg-surface-950/50 p-4">
        <p class="text-xs uppercase tracking-wide text-slate-500">Toggles</p>
        <div class="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <label v-for="field in checkboxFields" :key="field.key" class="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-surface-600 bg-surface-900 accent-sky-500"
              :checked="form[field.key] === 'true'"
              @change="form[field.key] = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
            />
            <span class="text-slate-300">{{ field.label }}</span>
            <span v-if="field.help" class="ml-auto text-xs text-slate-500">{{ field.help }}</span>
          </label>
        </div>
      </div>
    </form>

    <div v-else class="mt-4">
      <textarea
        v-model="rawText"
        rows="18"
        spellcheck="false"
        class="w-full resize-y rounded-md border border-surface-800 bg-surface-950 p-3 font-mono text-xs leading-relaxed text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-sky-500"
        placeholder="# Edit server.properties directly.&#10;# Comment and blank lines are preserved."
      ></textarea>
      <p class="mt-2 text-xs text-slate-500">
        Unknown keys are preserved on save. Invalid lines (bad keys, non key=value text) are rejected with a line-level report.
      </p>
    </div>

    <footer class="mt-4 flex items-center gap-3 border-t border-surface-700 pt-3">
      <p v-if="lastError" class="text-xs text-rose-300">{{ lastError }}</p>
      <p v-else-if="savedFlash" class="text-xs text-emerald-300">{{ savedFlash }}</p>
      <p v-else class="text-xs text-slate-500">Changes are written to disk immediately; most settings take effect after a restart.</p>
    </footer>
  </section>
</template>