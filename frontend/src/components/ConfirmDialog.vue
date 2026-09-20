<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    busy?: boolean;
  }>(),
  { confirmLabel: "Confirm", danger: false, busy: false },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "confirm"): void;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

function cancel(): void {
  if (props.busy) return;
  open.value = false;
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="cancel">
      <div class="w-full max-w-sm rounded-xl border border-surface-700 bg-surface-900 p-5 shadow-xl">
        <h3 class="text-lg font-semibold text-slate-100">{{ title }}</h3>
        <p class="mt-2 text-sm text-slate-400">{{ message }}</p>
        <footer class="mt-5 flex items-center justify-end gap-2">
          <button class="rounded-md bg-surface-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-surface-700" :disabled="busy" @click="cancel">
            Cancel
          </button>
          <button
            class="rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            :class="danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-sky-600 hover:bg-sky-500'"
            :disabled="busy"
            @click="emit('confirm')"
          >
            {{ busy ? "Working…" : confirmLabel }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>