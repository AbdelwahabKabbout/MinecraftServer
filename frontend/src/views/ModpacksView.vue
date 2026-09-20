<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import EmptyState from "@/components/EmptyState.vue";
import { useModpacksStore } from "@/stores/modpacks";
import { useServersStore } from "@/stores/servers";
import { modpackService, type ModpackRecord, type ValidationIssue } from "@/services/modpacks";

const store = useModpacksStore();
const servers = useServersStore();

const selectedId = ref<string | null>(null);
const editorOpen = ref(false);
const editingId = ref<string | null>(null);
const editorText = ref("");
const editorError = ref<{ code: string; message: string } | null>(null);
const editorSaving = ref(false);
const validateServerId = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

const selected = computed<ModpackRecord | undefined>(() =>
  selectedId.value ? store.items.find((m) => m.id === selectedId.value) : undefined,
);
const report = computed(() => (selectedId.value ? store.reports[selectedId.value] : undefined));

const SAMPLE_MANIFEST = JSON.stringify(
  {
    name: "My Survival Pack",
    version: "1.0.0",
    minecraftVersion: "1.21.4",
    loader: "fabric",
    loaderVersion: "0.16.14",
    mods: [
      {
        id: "fabric-api",
        name: "Fabric API",
        version: "0.118.0+1.21.4",
        filename: "fabric-api-0.118.0+1.21.4.jar",
        downloadUrl: "https://example.com/fabric-api.jar",
        sha256: "6a5b3d9e...".padEnd(64, "0"),
        required: true,
      },
    ],
  },
  null,
  2,
);

onMounted(() => {
  void store.fetchList();
  void servers.fetchServers();
});

function openNew(): void {
  editingId.value = null;
  editorError.value = null;
  editorText.value = SAMPLE_MANIFEST;
  editorOpen.value = true;
  selectedId.value = null;
}

function openEdit(record: ModpackRecord): void {
  editingId.value = record.id;
  editorError.value = null;
  editorText.value = modpackService.manifest(record);
  editorOpen.value = true;
}

async function saveEditor(): Promise<void> {
  editorError.value = null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(editorText.value);
  } catch {
    editorError.value = { code: "SYNTAX_ERROR", message: "The manifest is not valid JSON." };
    return;
  }
  editorSaving.value = true;
  try {
    if (editingId.value) {
      const updated = await store.update(editingId.value, parsed as never);
      if (updated) selectedId.value = updated.id;
    } else {
      const created = await store.create(parsed as never);
      if (created) selectedId.value = created.id;
    }
    editorOpen.value = false;
  } catch (error) {
    editorError.value = {
      code: (error as { code?: string }).code ?? "ERROR",
      message: error instanceof Error ? error.message : "Failed to save modpack.",
    };
  } finally {
    editorSaving.value = false;
  }
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const text = await file.text();
  const record = await store.importText(text);
  if (record) selectedId.value = record.id;
  input.value = "";
}

async function runValidate(): Promise<void> {
  if (!selectedId.value || !validateServerId.value) return;
  await store.validate(selectedId.value, validateServerId.value);
}

async function removeSelected(): Promise<void> {
  if (!selectedId.value) return;
  if (!window.confirm("Delete this modpack definition?")) return;
  await store.remove(selectedId.value);
  selectedId.value = null;
  editorOpen.value = false;
}

function issueClass(level: ValidationIssue["level"]): string {
  switch (level) {
    case "ok":
      return "text-emerald-300";
    case "missing":
      return "text-rose-300";
    case "version-mismatch":
      return "text-amber-300";
    case "checksum-mismatch":
      return "text-orange-300";
    case "unexpected":
      return "text-slate-400";
  }
}

function issueIcon(level: ValidationIssue["level"]): string {
  switch (level) {
    case "ok":
      return "✓";
    case "missing":
      return "✗";
    case "version-mismatch":
      return "⚠";
    case "checksum-mismatch":
      return "✕";
    case "unexpected":
      return "·";
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-100">Modpacks</h1>
        <p class="mt-1 text-sm text-slate-400">Immutable manifests describing a server's mod environment — imported, exported and validated against a server's <span class="font-mono">mods/</span> directory.</p>
      </div>
      <div class="flex items-center gap-2">
        <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="importFile" />
        <button class="rounded-md bg-surface-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-surface-700" @click="fileInput?.click()">
          Import .json
        </button>
        <button class="rounded-md bg-accent-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-500" @click="openNew">
          + New modpack
        </button>
      </div>
    </header>

    <div class="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside class="rounded-xl border border-surface-700 bg-surface-900 p-3">
        <p v-if="store.loading" class="p-3 text-sm text-slate-500">Loading…</p>
        <ul v-else class="space-y-1">
          <li v-for="item in store.items" :key="item.id">
            <button
              class="w-full rounded-lg px-3 py-2 text-left transition-colors"
              :class="selected?.id === item.id ? 'bg-surface-800' : 'hover:bg-surface-800/60'"
              @click="selectedId = item.id; editorOpen = false"
            >
              <span class="block text-sm font-medium text-slate-200">{{ item.name }}</span>
              <span class="mt-0.5 block font-mono text-xs text-slate-500">v{{ item.version }} · MC {{ item.minecraftVersion }}</span>
            </button>
          </li>
        </ul>
        <p v-if="!store.loading && store.items.length === 0" class="p-3 text-sm text-slate-500">No modpacks yet.</p>
      </aside>

      <section v-if="editorOpen" class="rounded-xl border border-surface-700 bg-surface-900 p-5">
        <header class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-slate-100">{{ editingId ? "Edit modpack" : "New modpack" }}</h2>
          <button class="text-sm text-slate-400 transition-colors hover:text-slate-200" @click="editorOpen = false">Cancel</button>
        </header>
        <p class="mt-1 text-xs text-slate-500">
          Paste a JSON manifest ({ name, version, minecraftVersion, loader, mods[] }). Filenames must be plain <span class="font-mono">*.jar</span> names.
        </p>
        <textarea
          v-model="editorText"
          rows="22"
          spellcheck="false"
          class="mt-3 w-full resize-y rounded-md border border-surface-700 bg-surface-900 p-3 font-mono text-xs text-slate-300 outline-none focus:border-accent-500"
        ></textarea>
        <div v-if="editorError" class="mt-3 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          <span class="font-mono text-xs">{{ editorError.code }}</span> — {{ editorError.message }}
        </div>
        <div class="mt-3 flex justify-end">
          <button class="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-500 disabled:opacity-50" :disabled="editorSaving" @click="saveEditor">
            {{ editorSaving ? "Saving…" : editingId ? "Save changes" : "Create modpack" }}
          </button>
        </div>
      </section>

      <section v-else-if="selected" class="space-y-4">
        <div class="rounded-xl border border-surface-700 bg-surface-900 p-5">
          <header class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-semibold text-slate-100">{{ selected.name }}</h2>
              <p class="mt-1 font-mono text-xs text-slate-500">
                {{ selected.slug }} · v{{ selected.version }} · MC {{ selected.minecraftVersion }} · {{ selected.loader }}
                {{ selected.loaderVersion ? ` ${selected.loaderVersion}` : "" }} · {{ selected.manifest.mods.length }} mods
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button class="rounded-md bg-surface-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-surface-700" @click="modpackService.download(selected)">
                Export
              </button>
              <button class="rounded-md bg-surface-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-surface-700" @click="openEdit(selected)">
                Edit
              </button>
              <button class="rounded-md bg-rose-600/80 px-3 py-2 text-sm text-white transition-colors hover:bg-rose-600" @click="removeSelected">
                Delete
              </button>
            </div>
          </header>

          <details class="mt-4">
            <summary class="cursor-pointer text-sm text-slate-400 transition-colors hover:text-slate-200">View manifest</summary>
            <pre class="mt-3 max-h-80 overflow-auto rounded-md bg-surface-800/60 p-3 font-mono text-xs text-slate-300">{{ modpackService.manifest(selected) }}</pre>
          </details>
        </div>

        <div class="rounded-xl border border-surface-700 bg-surface-900 p-5">
          <header class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-medium text-slate-300">Validate against a server</h3>
            <div class="flex items-center gap-2">
              <select
                v-model="validateServerId"
                class="rounded-md border border-surface-700 bg-surface-900 px-2 py-1.5 text-sm text-slate-300 outline-none focus:border-accent-500"
              >
                <option value="" disabled>Select server…</option>
                <option v-for="s in servers.servers" :key="s.id" :value="s.id">{{ s.name }} · {{ s.serverDirectory }}</option>
              </select>
              <button
                class="rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-500 disabled:opacity-50"
                :disabled="!validateServerId || store.validating"
                @click="runValidate"
              >
                {{ store.validating ? "Validating…" : "Run validation" }}
              </button>
            </div>
          </header>

          <template v-if="report">
            <div class="mt-4 flex flex-wrap gap-2 text-xs">
              <span class="rounded-full bg-surface-800 px-3 py-1 text-slate-300">{{ report.summary.ok }} ok</span>
              <span class="rounded-full bg-rose-500/10 px-3 py-1 text-rose-300">{{ report.summary.missing }} missing</span>
              <span class="rounded-full bg-amber-500/10 px-3 py-1 text-amber-300">{{ report.summary.versionMismatch }} version mismatches</span>
              <span class="rounded-full bg-orange-500/10 px-3 py-1 text-orange-300">{{ report.summary.checksumMismatch }} checksum mismatches</span>
              <span class="rounded-full bg-surface-800 px-3 py-1 text-slate-400">{{ report.summary.unexpected }} unexpected</span>
            </div>
            <ul class="mt-4 space-y-1.5">
              <li v-for="(issue, index) in report.issues" :key="index" class="flex items-center gap-2 font-mono text-xs" :class="issueClass(issue.level)">
                <span class="w-4 text-center">{{ issueIcon(issue.level) }}</span>
                <span>{{ issue.message }}</span>
              </li>
            </ul>
          </template>
          <p v-else class="mt-4 text-sm text-slate-500">Reading is read-only: validation only reports, it never writes to <span class="font-mono">mods/</span>.</p>
        </div>
      </section>

      <section v-else class="rounded-xl border border-surface-700 bg-surface-900">
        <EmptyState icon="▤" title="No modpack selected" description="Create, import or pick a modpack from the list to view and validate it." />
      </section>
    </div>
  </div>
</template>