<script setup lang="ts">
import EmptyState from "@/components/EmptyState.vue";
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-100">Server</h1>
        <p class="mt-1 text-sm text-slate-400">Instance detail, console and settings.</p>
      </div>
      <RouterLink
        to="/servers"
        class="rounded-md bg-surface-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-surface-700"
      >
        ← All servers
      </RouterLink>
    </header>

    <EmptyState
      icon="⬢"
      title="No server selected"
      description="The server detail page becomes available once server instances are implemented."
    />
  </div>
</template>