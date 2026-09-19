<script setup lang="ts">
defineProps<{
  status: "online" | "offline" | "starting" | "stopping" | "crashed" | "unknown" | "healthy" | "degraded";
}>();
</script>

<template>
  <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="{
      online: 'bg-emerald-500/15 text-emerald-300',
      healthy: 'bg-emerald-500/15 text-emerald-300',
      offline: 'bg-slate-500/15 text-slate-400',
      starting: 'bg-sky-500/15 text-sky-300',
      stopping: 'bg-amber-500/15 text-amber-300',
      crashed: 'bg-rose-500/15 text-rose-300',
      degraded: 'bg-amber-500/15 text-amber-300',
      unknown: 'bg-slate-500/15 text-slate-400',
    }[status]"
  >
    <span
      class="h-1.5 w-1.5 rounded-full"
      :class="{
        online: 'bg-emerald-400',
        healthy: 'bg-emerald-400',
        offline: 'bg-slate-500',
        starting: 'bg-sky-400 animate-pulse',
        stopping: 'bg-amber-400 animate-pulse',
        crashed: 'bg-rose-400',
        degraded: 'bg-amber-400',
        unknown: 'bg-slate-500',
      }[status]"
    />
    <span class="uppercase tracking-wide">{{ status }}</span>
  </span>
</template>