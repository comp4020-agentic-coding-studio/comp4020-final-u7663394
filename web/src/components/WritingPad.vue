<script setup lang="ts">
// Where one character is written. Points are kept exactly as the pointer
// reports them (scaled to the pad), so the ink on the scroll is this hand.
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { strokePath } from "../ink.ts";
import { INK_BOX, MAX_POINTS, MAX_STROKES, type Stroke } from "../../../shared/strokes.ts";

const props = defineProps<{
  char: string;
  pinyin: string;
  // when the brush runs out, on our clock; null once it has
  until: number | null;
  sending: boolean;
  problem: string | null;
  draftKey: string;
}>();
const emit = defineEmits<{ submit: [strokes: Stroke[]]; putDown: [] }>();

const loadDraft = (): Stroke[] => {
  try {
    return JSON.parse(localStorage.getItem(props.draftKey) ?? "[]") as Stroke[];
  } catch {
    return [];
  }
};
const strokes = ref<Stroke[]>(loadDraft());
const current = ref<Stroke | null>(null);
const guide = ref(true);
const pad = ref<SVGSVGElement | null>(null);
const heading = ref<HTMLElement | null>(null);

const pointCount = computed(() => strokes.value.reduce((n, s) => n + s.pts.length / 3, 0));
const full = computed(() => strokes.value.length >= MAX_STROKES || pointCount.value >= MAX_POINTS);

// A reload or a dropped connection shouldn't cost anyone their character.
watch(strokes, (s) => localStorage.setItem(props.draftKey, JSON.stringify(s)), { deep: true });

function point(e: PointerEvent, pen: boolean): number[] {
  const box = pad.value!.getBoundingClientRect();
  const clamp = (n: number): number => Math.min(INK_BOX, Math.max(0, Math.round(n)));
  return [
    clamp(((e.clientX - box.left) / box.width) * INK_BOX),
    clamp(((e.clientY - box.top) / box.height) * INK_BOX),
    pen ? Math.round(Math.min(1, Math.max(0, e.pressure)) * 100) / 100 : 0.5,
  ];
}

function down(e: PointerEvent): void {
  if (props.sending || full.value || (e.pointerType === "mouse" && e.button !== 0)) return;
  pad.value!.setPointerCapture(e.pointerId);
  const pen = e.pointerType === "pen";
  current.value = { pts: point(e, pen), pen };
}

function move(e: PointerEvent): void {
  const stroke = current.value;
  if (!stroke) return;
  for (const ev of e.getCoalescedEvents?.() ?? [e]) {
    if (pointCount.value + stroke.pts.length / 3 >= MAX_POINTS) break;
    stroke.pts.push(...point(ev, stroke.pen));
  }
}

function up(): void {
  if (current.value) strokes.value.push(current.value);
  current.value = null;
}

const undo = (): void => void strokes.value.pop();
const clear = (): void => void (strokes.value = []);

const paths = computed(() => strokes.value.map((s) => strokePath(s)));
const currentPath = computed(() => (current.value ? strokePath(current.value, false) : ""));

// countdown
const now = ref(Date.now());
const tick = setInterval(() => (now.value = Date.now()), 1000);
onUnmounted(() => clearInterval(tick));
const left = computed(() => {
  if (props.until === null) return null;
  const s = Math.max(0, Math.round((props.until - now.value) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
});

onMounted(() => heading.value?.focus());

defineExpose({ forget: () => localStorage.removeItem(props.draftKey) });
</script>

<template>
  <section class="pad-wrap" aria-labelledby="pad-heading">
    <header class="pad-head">
      <h2 id="pad-heading" ref="heading" tabindex="-1">
        Write <span class="target" lang="zh-Hans">{{ char }}</span>
        <span class="pinyin">{{ pinyin }}</span>
      </h2>
      <p class="hold" v-if="left !== null && left !== '0:00'">The brush is yours for {{ left }}</p>
      <p class="hold late" v-else>
        Time's up: you can still finish, unless someone else picks up the brush.
      </p>
    </header>

    <svg
      ref="pad"
      class="pad"
      :class="{ sending }"
      :viewBox="`0 0 ${INK_BOX} ${INK_BOX}`"
      role="img"
      :aria-label="`Writing pad for ${char}. Draw with a mouse, finger or pen.`"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @lostpointercapture="up"
    >
      <g class="grid" aria-hidden="true">
        <line x1="0" y1="500" x2="1000" y2="500" />
        <line x1="500" y1="0" x2="500" y2="1000" />
        <line x1="0" y1="0" x2="1000" y2="1000" />
        <line x1="1000" y1="0" x2="0" y2="1000" />
      </g>
      <text v-if="guide" class="guide" x="500" y="540" text-anchor="middle" dominant-baseline="middle">
        {{ char }}
      </text>
      <path v-for="(d, i) in paths" :key="i" :d="d" class="ink" />
      <path v-if="currentPath" :d="currentPath" class="ink" />
    </svg>

    <p v-if="full" class="note">That's as much ink as one character can hold.</p>
    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

    <div class="actions">
      <button type="button" class="quiet" @click="emit('putDown')" :disabled="sending">Put the brush down</button>
      <button type="button" class="primary" @click="emit('submit', strokes)" :disabled="!strokes.length || sending">
        {{ sending ? "Adding to the scroll…" : "Add to the scroll" }}
      </button>
    </div>
    <div class="tools">
      <label class="toggle"><input type="checkbox" v-model="guide" /> Show model character</label>
      <button type="button" @click="undo" :disabled="!strokes.length || sending">Undo stroke</button>
      <button type="button" @click="clear" :disabled="!strokes.length || sending">Clear</button>
    </div>
  </section>
</template>

<style scoped>
.pad-wrap {
  display: grid;
  gap: 0.75rem;
}
.pad-head h2 {
  margin: 0;
  font-size: 1.25rem;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.target {
  font-family: var(--brush-font);
  font-size: 2rem;
}
.pinyin {
  color: var(--muted);
  font-style: italic;
}
.hold {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.hold.late {
  color: var(--seal);
}
.pad {
  width: min(100%, 26rem, 52vh);
  aspect-ratio: 1;
  justify-self: center;
  background: #fbf7ec;
  border: 2px solid var(--seal);
  touch-action: none;
  cursor: crosshair;
  user-select: none;
  -webkit-user-select: none;
}
.pad.sending {
  opacity: 0.7;
}
.grid line {
  stroke: rgb(179 38 30 / 0.3);
  stroke-width: 3;
  stroke-dasharray: 18 14;
}
.guide {
  font-family: var(--brush-font);
  font-size: 760px;
  fill: rgb(29 27 25 / 0.1);
  pointer-events: none;
}
.ink {
  fill: var(--ink);
}
.tools,
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.actions {
  justify-content: space-between;
}
.toggle {
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
  margin-right: auto;
  font-size: 0.9rem;
}
.note {
  margin: 0;
  color: var(--muted);
}
.problem {
  margin: 0;
  color: var(--seal);
  font-weight: 600;
}
</style>
