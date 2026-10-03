<script setup lang="ts">
import { computed } from "vue";
import { strokePath } from "../ink.ts";
import { INK_BOX, type Stroke } from "../../../shared/strokes.ts";

const props = defineProps<{ strokes: Stroke[] }>();
const paths = computed(() => props.strokes.map((s) => strokePath(s)));
</script>

<template>
  <svg class="ink" :viewBox="`0 0 ${INK_BOX} ${INK_BOX}`" aria-hidden="true">
    <path v-for="(d, i) in paths" :key="i" :d="d" />
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
</style>
