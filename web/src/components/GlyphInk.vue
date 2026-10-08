<script setup lang="ts">
import { computed } from "vue";
import { strokePath } from "../ink.ts";
import { INK_BOX, type Stroke } from "../../../shared/strokes.ts";

// `current` is a stroke still being drawn, and `wet` marks live ink: a draft
// the room is watching, drawn from the same points but not yet on the scroll.
const props = defineProps<{ strokes: Stroke[]; current?: Stroke | null; wet?: boolean }>();
const paths = computed(() => props.strokes.map((s) => strokePath(s)));
const currentPath = computed(() => (props.current ? strokePath(props.current, false) : ""));
</script>

<template>
  <svg class="ink" :class="{ wet }" :viewBox="`0 0 ${INK_BOX} ${INK_BOX}`" aria-hidden="true">
    <path v-for="(d, i) in paths" :key="i" :d="d" />
    <path v-if="currentPath" :d="currentPath" />
  </svg>
</template>

<style scoped>
.ink {
  display: block;
  width: 100%;
  height: 100%;
}
path {
  fill: var(--ink);
}
.wet path {
  fill: var(--wet-ink);
}
</style>
