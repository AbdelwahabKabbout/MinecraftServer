<template>
  <div class="flex min-h-full flex-col items-center justify-center py-16 text-center">
    <div class="text-5xl">{{ icon }}</div>
    <h2 class="mt-4 text-lg font-semibold text-slate-200">{{ title }}</h2>
    <p class="mt-1 max-w-md text-sm text-slate-400">{{ description }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon?: string;
  title: string;
  description: string;
}>();
</script>