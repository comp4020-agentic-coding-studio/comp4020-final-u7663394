<script setup lang="ts">
// The scroll: one column per line, read top to bottom and right to left, as a
// handscroll is. Every written character carries its writer's seal.
import { computed } from "vue";
import GlyphInk from "./GlyphInk.vue";
import { characters, textById } from "../../../shared/texts.ts";
import type { Brush, Glyph } from "../../../shared/api.ts";

const props = defineProps<{
  textId: string;
  glyphs: Glyph[];
  brush?: Brush | null;
  meId?: string | null;
  large?: boolean;
}>();

const columns = computed(() => {
  const text = textById(props.textId);
  if (!text) return [];
  const byPosition = new Map(props.glyphs.map((g) => [g.position, g]));
  const next = props.glyphs.length;
  const cells = characters(text).map((c, position) => ({
    ...c,
    position,
    glyph: byPosition.get(position) ?? null,
    next: position === next,
    writing: props.brush && props.brush.position === position ? props.brush.holder.name : null,
  }));
  return text.lines.map((_, column) => cells.filter((c) => c.column === column));
});

function label(cell: (typeof columns.value)[number][number]): string {
  if (cell.glyph) return `${cell.char}, written by ${cell.glyph.writer.name}`;
  if (cell.writing) return `${cell.char}, being written by ${cell.writing}`;
  return cell.next ? `${cell.char}, next to be written` : `${cell.char}, not yet written`;
}
</script>

<template>
  <div class="paper" :class="{ large }">
    <ol class="column" v-for="(column, i) in columns" :key="i">
      <li
        v-for="cell in column"
        :key="cell.position"
        class="cell"
        :class="{ written: cell.glyph, next: cell.next, mine: meId && cell.glyph?.writer.id === meId }"
        role="img"
        :aria-label="label(cell)"
      >
        <div class="square">
          <GlyphInk v-if="cell.glyph" :strokes="cell.glyph.strokes" />
          <span v-else class="model" aria-hidden="true">{{ cell.char }}</span>
        </div>
        <span v-if="cell.glyph" class="seal" :title="cell.glyph.writer.name">{{ cell.glyph.writer.name }}</span>
        <span v-else-if="cell.writing" class="seal pending">{{ cell.writing }}…</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.paper {
  --cell: clamp(52px, min(13vw, 10.5vh), 104px);
  display: flex;
  flex-direction: row-reverse;
  justify-content: center;
  gap: clamp(0.75rem, 3vw, 2.5rem);
  padding: clamp(1rem, 3vw, 2rem) clamp(1rem, 4vw, 3rem);
  background:
    radial-gradient(ellipse at 30% 20%, rgb(255 255 255 / 0.5), transparent 60%),
    var(--paper-deep);
  border-block: 10px solid var(--mount);
  box-shadow: 0 2px 12px rgb(60 40 20 / 0.18);
}
.paper.large {
  --cell: clamp(60px, min(16vw, 12vh), 128px);
}
.column {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.cell {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.square {
  width: var(--cell);
  height: var(--cell);
  display: grid;
  place-items: center;
  border: 1px dashed transparent;
}
.cell:not(.written) .square {
  border-color: rgb(179 38 30 / 0.25);
}
.model {
  font-family: var(--brush-font);
  font-size: calc(var(--cell) * 0.78);
  line-height: 1;
  color: rgb(29 27 25 / 0.1);
}
.next .square {
  border: 2px solid var(--seal);
  animation: breathe 2.4s ease-in-out infinite;
}
.next .model {
  color: rgb(29 27 25 / 0.22);
}
@keyframes breathe {
  50% {
    box-shadow: 0 0 0 4px rgb(179 38 30 / 0.15);
  }
}
@media (prefers-reduced-motion: reduce) {
  .next .square {
    animation: none;
  }
}
.written .square {
  animation: land 0.6s ease-out;
}
@keyframes land {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
}
@media (prefers-reduced-motion: reduce) {
  .written .square {
    animation: none;
  }
}
.seal {
  writing-mode: vertical-rl;
  max-height: var(--cell);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: clamp(0.62rem, 1.4vw, 0.78rem);
  line-height: 1.1;
  padding: 0.25rem 0.1rem;
  border-radius: 2px;
  background: var(--seal);
  color: var(--paper);
  min-width: 1.15rem;
}
.seal.pending {
  background: transparent;
  color: var(--seal);
  border: 1px solid var(--seal);
}
.mine .seal {
  outline: 2px solid var(--seal);
  outline-offset: 2px;
}
.cell:not(:has(.seal))::after {
  content: "";
  min-width: 1.15rem;
}
</style>
