<script setup lang="ts">
import EmptyState from "@/components/EmptyState.vue";
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-100">Servers</h1>
        <p class="mt-1 text-sm text-slate-400">Manage your Minecraft server instances.</p>
      </div>
      <button
        class="rounded-md bg-surface-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-surface-700"
        title="Server registration arrives in the next milestone"
        disabled
      >
        + New server
      </button>
    </header>

    <EmptyState
      icon="⬢"
      title="No servers registered"
      description="Server instance management is the next milestone. You will be able to register servers from your servers/ directory and control them here."
    />
  </div>
</template>