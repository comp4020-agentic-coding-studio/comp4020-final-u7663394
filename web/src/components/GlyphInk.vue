<script setup lang="ts">
import { onMounted, onUnmounted, ref, toRaw, watch } from "vue";
import { inkPainter } from "../ink.ts";
import { DEFAULT_STYLE, type BrushStyle, type Stroke } from "../../../shared/strokes.ts";

// `current` is a stroke still being drawn, and `wet` marks live ink: a draft
// the room is watching, drawn from the same points but not yet on the scroll.
const props = defineProps<{ strokes: Stroke[]; brushStyle?: BrushStyle; current?: Stroke | null; wet?: boolean }>();
const canvas = ref<HTMLCanvasElement | null>(null);

let paint: ReturnType<typeof inkPainter> | null = null;
let frame = 0;
// at most once a frame, however fast points or slider moves arrive
function redraw(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!paint) return;
    const current = props.current ? toRaw(props.current) : null;
    paint(toRaw(props.strokes), toRaw(props.brushStyle) ?? DEFAULT_STYLE, current);
  });
}

// The canvas is as many device pixels as it shows (up to 2 per CSS pixel), and
// is drawn again whenever its size changes, mid-stroke included.
const resized = new ResizeObserver(([entry]) => {
  const el = canvas.value;
  if (!el) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = Math.max(1, Math.round(entry.contentRect.width * dpr));
  if (el.width !== size || el.height !== size) {
    el.width = el.height = size;
    redraw();
  }
});
onMounted(() => {
  paint = inkPainter(canvas.value!);
  resized.observe(canvas.value!);
});
onUnmounted(() => {
  resized.disconnect();
  cancelAnimationFrame(frame);
});

watch(
  () => [
    props.strokes,
    props.strokes.length,
    props.current,
    props.current?.pts.length,
    props.brushStyle?.weight,
    props.brushStyle?.wetness,
    props.brushStyle?.speed,
  ],
  redraw,
);
</script>

<template>
  <canvas ref="canvas" class="ink" :class="{ wet }" aria-hidden="true" />
</template>

<style scoped>
.ink {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  /* ink soaks into the paper rather than sitting on it */
  mix-blend-mode: multiply;
}
.wet {
  opacity: 0.55;
}
</style>
