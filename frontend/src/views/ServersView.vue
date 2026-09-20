<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import EmptyState from "@/components/EmptyState.vue";
import StatusPill, { type PillStatus } from "@/components/StatusPill.vue";
import ServerFormModal from "@/components/ServerFormModal.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import { useServersStore } from "@/stores/servers";
import type { ManagedServer, ServerStatus } from "@/services/servers";

const router = useRouter();
const store = useServersStore();

const showForm = ref(false);
const editing = ref<ManagedServer | null>(null);
const deleting = ref<ManagedServer | null>(null);
const deleteBusy = ref(false);

const actionBusy = ref<string | null>(null);

onMounted(() => {
  void store.fetchServers();
  store.connectLive();
});

onUnmounted(() => {
  store.disconnectLive();
});

function pillStatus(status: ServerStatus): PillStatus {
  return status.toLowerCase() as PillStatus;
}

function openCreate(): void {
  editing.value = null;
  showForm.value = true;
}

function openEdit(server: ManagedServer): void {
  editing.value = server;
  showForm.value = true;
}

async function handleAction(server: ManagedServer, action: "start" | "stop" | "restart"): Promise<void> {
  actionBusy.value = server.id;
  try {
    await store[action](server.id);
    await store.fetchServers();
  } finally {
    actionBusy.value = null;
  }
}

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return;
  deleteBusy.value = true;
  try {
    await store.remove(deleting.value.id);
  } finally {
    deleteBusy.value = false;
    deleting.value = null;
  }
}

function openDetail(id: string): void {
  void router.push({ name: "server-detail", params: { id } });
}

function isRunning(server: ManagedServer): boolean {
  return server.status === "STARTING" || server.status === "ONLINE" || server.status === "STOPPING";
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-100">Servers</h1>
        <p class="mt-1 text-sm text-slate-400">Manage your Minecraft server instances.</p>
      </div>
      <button class="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500" @click="openCreate">
        + New server
      </button>
    </header>

    <p v-if="store.error" class="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{{ store.error }}</p>

    <div v-if="store.loading" class="rounded-xl border border-surface-700 bg-surface-900 p-8 text-center text-sm text-slate-400">
      Loading servers…
    </div>

    <div v-else-if="store.servers.length === 0" class="rounded-xl border border-surface-700 bg-surface-900">
      <EmptyState
        icon="⬢"
        title="No servers registered"
        description="Register a server pointing at a directory inside servers/. The manager detects the server jar, EULA state and game structure automatically."
      >
        <button class="mt-4 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500" @click="openCreate">
          + Register your first server
        </button>
      </EmptyState>
    </div>

    <div v-else class="overflow-hidden rounded-xl border border-surface-700 bg-surface-900">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-surface-700 bg-surface-800/50 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th class="px-4 py-3">Server</th>
            <th class="px-4 py-3">Directory</th>
            <th class="px-4 py-3">Version</th>
            <th class="px-4 py-3">Port</th>
            <th class="px-4 py-3">Memory</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-surface-700">
          <tr
            v-for="server in store.servers"
            :key="server.id"
            class="cursor-pointer transition-colors hover:bg-surface-800/40"
            @click="openDetail(server.id)"
          >
            <td class="px-4 py-3">
              <div class="font-medium text-slate-200">{{ server.name }}</div>
              <div class="text-xs text-slate-500">{{ server.loader }}{{ server.loaderVersion ? ` · ${server.loaderVersion}` : "" }}</div>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-slate-400">{{ server.serverDirectory }}</td>
            <td class="px-4 py-3 text-slate-300">{{ server.minecraftVersion ?? "—" }}</td>
            <td class="px-4 py-3 text-slate-300">{{ server.port }}</td>
            <td class="px-4 py-3 text-xs text-slate-400">{{ server.memoryMinMb }}–{{ server.memoryMaxMb }} MB</td>
            <td class="px-4 py-3">
              <StatusPill :status="pillStatus(server.status)" />
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center justify-end gap-1.5" @click.stop>
                <button
                  v-if="isRunning(server)"
                  class="rounded-md bg-surface-800 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-surface-700 disabled:opacity-50"
                  :disabled="actionBusy === server.id"
                  title="Stop gracefully"
                  @click="handleAction(server, 'stop')"
                >
                  Stop
                </button>
                <button
                  v-if="isRunning(server)"
                  class="rounded-md bg-surface-800 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-surface-700 disabled:opacity-50"
                  :disabled="actionBusy === server.id"
                  title="Restart"
                  @click="handleAction(server, 'restart')"
                >
                  Restart
                </button>
                <button
                  v-if="!isRunning(server)"
                  class="rounded-md bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
                  :disabled="actionBusy === server.id"
                  title="Start"
                  @click="handleAction(server, 'start')"
                >
                  Start
                </button>
                <button class="rounded-md bg-surface-800 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-surface-700" title="Edit" @click="openEdit(server)">
                  Edit
                </button>
                <button class="rounded-md bg-surface-800 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-rose-500/10 hover:text-rose-300" title="Delete" @click="deleting = server">
                  Delete
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ServerFormModal v-model="showForm" :server="editing" @saved="openDetail($event.id)" />
    <ConfirmDialog
      :model-value="deleting !== null"
      @update:model-value="(openNow: boolean) => { if (!openNow) deleting = null }"
      :busy="deleteBusy"
      danger
      title="Delete server"
      :message="`Delete “${deleting?.name}”? Server files in ${deleting?.serverDirectory} are left untouched on disk.`"
      confirm-label="Delete"
      @confirm="confirmDelete"
    />
  </div>
</template>