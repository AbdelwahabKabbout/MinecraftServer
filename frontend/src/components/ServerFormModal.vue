<script setup lang="ts">
import { ref, reactive, watch, computed } from "vue";
import { useServersStore } from "@/stores/servers";
import type { ManagedServer, ServerCreatePayload } from "@/services/servers";

const props = defineProps<{
  modelValue: boolean;
  server: ManagedServer | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "saved", server: ManagedServer): void;
}>();

const store = useServersStore();

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const form = reactive({
  name: "",
  serverDirectory: "",
  minecraftVersion: "",
  loaderVersion: "",
  javaPath: "java",
  memoryMinMb: 1024,
  memoryMaxMb: 2048,
  port: 25565,
});

const submitting = ref(false);
const formError = ref<string | null>(null);

watch(
  () => [props.modelValue, props.server] as const,
  () => {
    if (!props.modelValue) return;
    formError.value = null;
    const s = props.server;
    form.name = s?.name ?? "";
    form.serverDirectory = s?.serverDirectory ?? "";
    form.minecraftVersion = s?.minecraftVersion ?? "";
    form.loaderVersion = s?.loaderVersion ?? "";
    form.javaPath = s?.javaPath ?? "java";
    form.memoryMinMb = s?.memoryMinMb ?? 1024;
    form.memoryMaxMb = s?.memoryMaxMb ?? 2048;
    form.port = s?.port ?? 25565;
  },
  { immediate: true },
);

function close(): void {
  if (submitting.value) return;
  open.value = false;
}

async function submit(): Promise<void> {
  formError.value = null;
  const payload: ServerCreatePayload = {
    name: form.name.trim(),
    serverDirectory: form.serverDirectory.trim(),
    minecraftVersion: form.minecraftVersion.trim() || undefined,
    loaderVersion: form.loaderVersion.trim() || undefined,
    loader: "fabric",
    javaPath: form.javaPath.trim() || undefined,
    memoryMinMb: form.memoryMinMb,
    memoryMaxMb: form.memoryMaxMb,
    port: form.port,
  };
  if (!payload.name) {
    formError.value = "Name is required.";
    return;
  }
  if (!payload.serverDirectory) {
    formError.value = "Server directory is required.";
    return;
  }
  const validPort = Number.isInteger(payload.port) && payload.port! >= 1 && payload.port! <= 65535;
  if (!validPort) {
    formError.value = "Port must be between 1 and 65535.";
    return;
  }

  submitting.value = true;
  try {
    const server = props.server
      ? await store.update(props.server.id, payload)
      : await store.create(payload);
    if (server) {
      emit("saved", server);
      close();
    }
  } catch (error) {
    formError.value = error instanceof Error ? error.message : "Failed to save server.";
  } finally {
    submitting.value = false;
  }
}

const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400";
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="close"
    >
      <div class="w-full max-w-lg rounded-xl border border-surface-700 bg-surface-900 shadow-xl">
        <header class="flex items-center justify-between border-b border-surface-700 px-5 py-4">
          <h2 class="text-lg font-semibold text-slate-100">
            {{ props.server ? `Edit ${props.server.name}` : "Register a server" }}
          </h2>
          <button class="text-slate-400 transition-colors hover:text-slate-200" title="Close" @click="close">✕</button>
        </header>

        <form class="space-y-4 px-5 py-4" @submit.prevent="submit">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="block">
                <span :class="label">Name</span>
                <input v-model="form.name" type="text" class="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-sky-500" placeholder="Survival World" />
              </label>
            </div>
            <div class="sm:col-span-2">
              <label class="block">
                <span :class="label">Server directory (relative to servers/)</span>
                <input v-model="form.serverDirectory" type="text" class="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-sky-500" placeholder="survival-world" />
              </label>
            </div>
            <div>
              <label class="block">
                <span :class="label">Minecraft version</span>
                <input v-model="form.minecraftVersion" type="text" class="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-sky-500" placeholder="1.21.4" />
              </label>
            </div>
            <div>
              <label class="block">
                <span :class="label">Loader version</span>
                <input v-model="form.loaderVersion" type="text" class="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-sky-500" placeholder="0.16.10" />
              </label>
            </div>
            <div class="sm:col-span-2">
              <label class="block">
                <span :class="label">Java executable</span>
                <input v-model="form.javaPath" type="text" class="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-sky-500" placeholder="java or C:\...\javaw.exe" />
              </label>
            </div>
            <div>
              <label class="block">
                <span :class="label">Min heap (MB)</span>
                <input v-model.number="form.memoryMinMb" type="number" min="1" class="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-sky-500" />
              </label>
            </div>
            <div>
              <label class="block">
                <span :class="label">Max heap (MB)</span>
                <input v-model.number="form.memoryMaxMb" type="number" min="1" class="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-sky-500" />
              </label>
            </div>
            <div>
              <label class="block">
                <span :class="label">Port</span>
                <input v-model.number="form.port" type="number" min="1" max="65535" class="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-sky-500" />
              </label>
            </div>
          </div>

          <p v-if="formError" class="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{{ formError }}</p>

          <footer class="flex items-center justify-end gap-2 border-t border-surface-700 pt-4">
            <button type="button" class="rounded-md bg-surface-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-surface-700" @click="close">
              Cancel
            </button>
            <button
              type="submit"
              :disabled="submitting"
              class="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {{ submitting ? "Saving…" : props.server ? "Save changes" : "Register server" }}
            </button>
          </footer>
        </form>
      </div>
    </div>
  </Teleport>
</template>