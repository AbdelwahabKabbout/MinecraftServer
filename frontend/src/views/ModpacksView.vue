<script setup lang="ts">
import EmptyState from "@/components/EmptyState.vue";
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <header>
      <h1 class="text-2xl font-semibold text-slate-100">Modpacks</h1>
      <p class="mt-1 text-sm text-slate-400">Create modpack definitions and validate server mods.</p>
    </header>

    <EmptyState
      icon="▤"
      title="No modpacks yet"
      description="Modpack manifests, import/export and server validation arrive in a later milestone."
    />
  </div>
</template>