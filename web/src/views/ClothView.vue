<script setup lang="ts">
// A room's water cloth (doc/adr/0006-the-water-cloth.md): while one person
// holds the brush, everyone else practises the line here at once. Each stroke
// is signed while wet and dries away on the server's clock. The scroll is
// never far: who holds the brush, their live ink, and when it's free are on
// this page too, so waiting here never means missing a turn.
import { computed, onUnmounted, ref, toRef, watch } from "vue";
import GlyphInk from "../components/GlyphInk.vue";
import BrushControls from "../components/BrushControls.vue";
import NameForm from "../components/NameForm.vue";
import { useRoom } from "../useRoom.ts";
import { api, ApiFailure, me } from "../api.ts";
import { characters, textById } from "../../../shared/texts.ts";
import { CLOTH_MAX_POINTS, HALL, type ClothStroke } from "../../../shared/api.ts";
import { DEFAULT_STYLE, INK_BOX, isBrushStyle, type BrushStyle, type Stroke } from "../../../shared/strokes.ts";

const props = defineProps<{ room: string }>();

const wet = ref<ClothStroke[]>([]);
const clothSaid = ref("");
// people already announced as writing on the cloth, so each is said once
const heard = new Set<string>();

function add(stroke: ClothStroke): void {
  if (wet.value.some((s) => s.id === stroke.id)) return;
  wet.value = [...wet.value, stroke].sort((a, b) => a.id - b.id);
  if (stroke.writer.id !== me.value?.id && !heard.has(stroke.writer.id)) {
    heard.add(stroke.writer.id);
    clothSaid.value = `${stroke.writer.name} is writing on the cloth.`;
  }
}

async function loadCloth(): Promise<void> {
  try {
    const { strokes } = await api.cloth(props.room);
    // strokes that arrived while this was on its way are kept
    const newest = strokes.reduce((n, s) => Math.max(n, s.id), 0);
    const later = wet.value.filter((s) => s.id > newest);
    wet.value = [...strokes, ...later];
    for (const s of strokes) heard.add(s.writer.id);
  } catch {
    // the room's own refetch shows the problem; the next one tries again
  }
}

const { state, live, error, skew, announcement, ink } = useRoom(toRef(props, "room"), {
  cloth: ({ stroke }) => add(stroke),
  clothWipe: ({ ids }) => (wet.value = wet.value.filter((s) => !ids.includes(s.id))),
  refreshed: () => void loadCloth(),
});

const text = computed(() => (state.value ? textById(state.value.scroll.textId) : undefined));
const chars = computed(() => (text.value ? characters(text.value) : []));
const nextPosition = computed(() => state.value?.scroll.glyphs.length ?? 0);
const nextChar = computed(() => chars.value[nextPosition.value]);
const roomPath = computed(() => (props.room === HALL ? "/" : `/r/${props.room}`));

// ---- the brush, from here ----

const othersBrush = computed(() => {
  const b = state.value?.brush;
  return b && b.holder.id !== me.value?.id ? b : null;
});
const myBrush = computed(() => !!state.value?.brush && state.value.brush.holder.id === me.value?.id);
const iWroteLast = computed(() => !!me.value && state.value?.lastWriter?.id === me.value.id);
const canTake = computed(() => !!me.value && !state.value?.brush && !iWroteLast.value && !!nextChar.value);
// say so when the brush comes free for someone who can take it
watch(canTake, (now, before) => {
  if (now && before === false && nextChar.value) {
    clothSaid.value = `The brush is free. You can write ${nextChar.value.char}.`;
  }
});
const said = computed(() => [announcement.value, clothSaid.value].filter(Boolean).join(" "));

// ---- drying ----

const now = ref(Date.now());
const tick = setInterval(() => {
  now.value = Date.now();
  const serverNow = now.value + skew.value;
  if (wet.value.some((s) => s.driesAt <= serverNow)) wet.value = wet.value.filter((s) => s.driesAt > serverNow);
}, 1000);
onUnmounted(() => clearInterval(tick));

// how far through drying, for the fade: a negative delay starts each stroke's
// animation where it already is, so every screen fades it on the same clock
function drying(s: ClothStroke): Record<string, string> {
  const total = s.driesAt - s.writtenAt;
  const gone = Math.min(total, Math.max(0, Date.now() + skew.value - s.writtenAt));
  return { animationDuration: `${total}ms`, animationDelay: `-${gone}ms` };
}

// ---- the square being written on ----

const picked = ref<string | null>(null);
const square = computed(() => picked.value ?? nextChar.value?.char ?? chars.value[0]?.char ?? "");
const squareInfo = computed(() => chars.value.find((c) => c.char === square.value));
const onSquare = (char: string): ClothStroke[] => wet.value.filter((s) => s.char === char);
const writersNow = computed(() => {
  const names = new Map<string, string>();
  for (const s of wet.value) names.set(s.writer.id, s.writer.name);
  return [...names].map(([id, name]) => ({ id, name }));
});
const mineWet = computed(() => wet.value.filter((s) => s.writer.id === me.value?.id).length);

// the writer's brush is the one the pad remembers, so practice feels the same
const STYLE_KEY = "relay:brush-style";
const loadStyle = (): BrushStyle => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STYLE_KEY) ?? "null");
    return isBrushStyle(saved) ? { weight: saved.weight, wetness: saved.wetness, speed: saved.speed } : { ...DEFAULT_STYLE };
  } catch {
    return { ...DEFAULT_STYLE };
  }
};
const style = ref<BrushStyle>(loadStyle());
watch(style, (s) => localStorage.setItem(STYLE_KEY, JSON.stringify(s)));

const pad = ref<HTMLDivElement | null>(null);
const current = ref<Stroke | null>(null);
// strokes sent but not yet back from the server, so they don't flicker away
const pending = ref<{ char: string; stroke: Stroke }[]>([]);
const problem = ref<string | null>(null);

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
  if (!me.value || (e.pointerType === "mouse" && e.button !== 0)) return;
  pad.value!.setPointerCapture(e.pointerId);
  const pen = e.pointerType === "pen";
  current.value = { pts: point(e, pen), pen };
}

function move(e: PointerEvent): void {
  const stroke = current.value;
  if (!stroke) return;
  for (const ev of e.getCoalescedEvents?.() ?? [e]) {
    if (stroke.pts.length / 3 >= CLOTH_MAX_POINTS) break;
    stroke.pts.push(...point(ev, stroke.pen));
  }
}

async function up(): Promise<void> {
  const stroke = current.value;
  if (!stroke) return;
  current.value = null;
  const char = square.value;
  const sent = { char, stroke };
  pending.value = [...pending.value, sent];
  problem.value = null;
  try {
    add((await api.writeOnCloth(props.room, char, stroke, { ...style.value })).stroke);
  } catch (e) {
    problem.value =
      e instanceof ApiFailure && e.code !== "server_error" ? e.message : "That stroke didn't reach the cloth.";
  } finally {
    pending.value = pending.value.filter((p) => p !== sent);
  }
}

async function dryMine(): Promise<void> {
  problem.value = null;
  try {
    const { ids } = await api.dryMine(props.room);
    wet.value = wet.value.filter((s) => !ids.includes(s.id));
  } catch (e) {
    problem.value = (e as Error).message;
  }
}

// the seal sits where the stroke began
const sealAt = (s: Stroke): Record<string, string> => ({
  left: `${(s.pts[0] / INK_BOX) * 100}%`,
  top: `${(s.pts[1] / INK_BOX) * 100}%`,
});
</script>

<template>
  <div class="cloth-page">
    <p class="sr-only" aria-live="polite">{{ said }}</p>

    <p v-if="error && !state" class="problem" role="alert">{{ error }}</p>
    <p v-else-if="!state" class="loading">Wetting the cloth…</p>

    <template v-else>
      <section class="intro" aria-labelledby="cloth-heading">
        <p class="where">
          {{ room === HALL ? "The hall" : `Room “${room}”` }} ·
          <span class="presence">{{ state.present }} {{ state.present === 1 ? "person" : "people" }} here</span>
          · <span class="live" :class="{ down: !live }">{{ live ? "live" : "reconnecting…" }}</span>
        </p>
        <h1 id="cloth-heading">Water cloth <span lang="zh-Hans" class="zh">水写布</span></h1>
        <p class="lede">
          Practise the line together while the brush is busy. Everyone writes at once; every stroke carries its
          writer's name and dries away within a minute and a half, like water on a park's paving stones. Nothing here
          is kept.
        </p>
      </section>

      <!-- the scroll, from here: waiting on the cloth never means missing a turn -->
      <section class="turn" :class="{ free: canTake }" aria-labelledby="turn-heading" role="status">
        <h2 id="turn-heading" class="sr-only">The scroll</h2>
        <div v-if="othersBrush || myBrush" class="watch" aria-hidden="true">
          <span class="model" lang="zh-Hans">{{ chars[state.brush!.position]?.char }}</span>
          <GlyphInk
            v-if="ink && ink.position === state.brush!.position"
            :strokes="ink.strokes"
            :current="ink.current"
            :brush-style="ink.style"
            wet
          />
        </div>
        <div class="turn-text">
          <template v-if="myBrush">
            <p class="big">You're holding the brush.</p>
            <RouterLink :to="roomPath" class="go">Back to the scroll to write</RouterLink>
          </template>
          <template v-else-if="othersBrush">
            <p class="big">
              <strong>{{ othersBrush.holder.name }}</strong> is writing
              <span class="char" lang="zh-Hans">{{ chars[othersBrush.position]?.char }}</span> on the scroll
            </p>
            <p class="hint">Their brush moves in the square here. This page tells you when it's free.</p>
          </template>
          <template v-else-if="canTake">
            <p class="big">
              The brush is free. Next on the scroll:
              <span class="char" lang="zh-Hans">{{ nextChar!.char }}</span>
            </p>
            <RouterLink :to="roomPath" class="go">Go and write it</RouterLink>
          </template>
          <template v-else-if="iWroteLast">
            <p class="big">You wrote the last character; the brush passes on.</p>
            <p class="hint">Someone else writes next. Practise here meanwhile.</p>
          </template>
          <template v-else>
            <p class="big">
              The brush is free. Next on the scroll:
              <span class="char" lang="zh-Hans">{{ nextChar?.char }}</span>
            </p>
            <p class="hint">Choose a name below to write on the scroll and the cloth.</p>
          </template>
        </div>
      </section>

      <NameForm v-if="!me" prompt="Choose a name to write on the cloth" submit-label="Join in" />

      <div class="workspace">
        <section class="board" aria-labelledby="square-heading">
          <h2 id="square-heading">
            Practising <span class="target" lang="zh-Hans">{{ square }}</span>
            <span class="pinyin">{{ squareInfo?.pinyin }}</span>
          </h2>

          <div
            ref="pad"
            class="cloth"
            :class="{ locked: !me }"
            role="img"
            :aria-label="`Water cloth for ${square}, with ${onSquare(square).length} wet strokes. Draw with a mouse, finger or pen.`"
            @pointerdown="down"
            @pointermove="move"
            @pointerup="up"
            @pointercancel="up"
            @lostpointercapture="up"
          >
            <svg class="grid" :viewBox="`0 0 ${INK_BOX} ${INK_BOX}`" aria-hidden="true">
              <line x1="0" y1="500" x2="1000" y2="500" />
              <line x1="500" y1="0" x2="500" y2="1000" />
              <line x1="0" y1="0" x2="1000" y2="1000" />
              <line x1="1000" y1="0" x2="0" y2="1000" />
              <text class="guide" x="500" y="540" text-anchor="middle" dominant-baseline="middle">{{ square }}</text>
            </svg>
            <div v-for="s in onSquare(square)" :key="s.id" class="stroke" :style="drying(s)">
              <GlyphInk :strokes="[s.stroke]" :brush-style="s.style" />
              <span class="sign" :class="{ mine: s.writer.id === me?.id }" :style="sealAt(s.stroke)">{{
                s.writer.name
              }}</span>
            </div>
            <GlyphInk
              v-for="(p, i) in pending.filter((p) => p.char === square)"
              :key="`p${i}`"
              :strokes="[p.stroke]"
              :brush-style="style"
            />
            <GlyphInk v-if="current" :strokes="[]" :current="current" :brush-style="style" />
          </div>

          <p v-if="!me" class="hint">Choose a name above, and your strokes will carry it while they're wet.</p>
          <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

          <div class="tools">
            <button type="button" :disabled="!mineWet" @click="dryMine">
              Dry my strokes now<template v-if="mineWet"> ({{ mineWet }})</template>
            </button>
            <span class="hint">Only yours: nobody can wipe anyone else's.</span>
          </div>
        </section>

        <aside class="side">
          <nav class="squares" aria-label="Squares on the cloth">
            <button
              v-for="(c, position) in chars"
              :key="position"
              type="button"
              class="square"
              :class="{ next: position === nextPosition }"
              :aria-pressed="c.char === square"
              :aria-label="`${c.char} ${c.pinyin}, ${onSquare(c.char).length} wet strokes${position === nextPosition ? ', next on the scroll' : ''}`"
              @click="picked = c.char"
            >
              <span class="model" lang="zh-Hans" aria-hidden="true">{{ c.char }}</span>
              <span v-for="s in onSquare(c.char)" :key="s.id" class="stroke" :style="drying(s)" aria-hidden="true">
                <GlyphInk :strokes="[s.stroke]" :brush-style="s.style" />
              </span>
            </button>
          </nav>

          <section class="who" aria-labelledby="who-heading">
            <h2 id="who-heading">On the cloth now</h2>
            <p v-if="!writersNow.length" class="hint">Nobody yet. The cloth is dry.</p>
            <ul v-else>
              <li v-for="w in writersNow" :key="w.id" class="seal-inline">{{ w.name }}</li>
            </ul>
          </section>

          <BrushControls
            v-model="style"
            :disabled="!me"
            hint="The same brush as on the scroll. A wetter brush stays on the cloth longer."
          />

          <p class="translation">“{{ text?.translation }}”</p>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cloth-page {
  display: grid;
  gap: 1.25rem;
}
.intro h1 {
  font-size: clamp(1.5rem, 4.5vw, 2.1rem);
  margin: 0.2rem 0;
}
.where {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.lede {
  margin: 0.2rem 0 0;
  max-width: 44rem;
}
.live::before {
  content: "●";
  color: #3c7a3c;
  margin-right: 0.2rem;
}
.live.down::before {
  color: var(--seal);
}
.turn {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 0.7rem 0.9rem;
  background: var(--paper-deep);
  border-left: 4px solid var(--mount);
}
.turn.free {
  border-left-color: var(--seal);
  animation: call 2.4s ease-in-out 3;
}
@keyframes call {
  50% {
    box-shadow: 0 0 0 4px rgb(179 38 30 / 0.18);
  }
}
@media (prefers-reduced-motion: reduce) {
  .turn.free {
    animation: none;
  }
}
.turn p {
  margin: 0;
}
.watch {
  flex: none;
  width: 4.5rem;
  height: 4.5rem;
  display: grid;
  place-items: center;
  border: 2px solid var(--seal);
  background: #fbf7ec;
}
.watch > * {
  grid-area: 1 / 1;
}
.watch .model {
  font-family: var(--brush-font);
  font-size: 3.4rem;
  line-height: 1;
  color: rgb(29 27 25 / 0.15);
}
.big {
  font-size: 1.1rem;
}
.char,
.target {
  font-family: var(--brush-font);
  font-size: 1.6rem;
  vertical-align: -0.12em;
}
.go {
  display: inline-block;
  margin-top: 0.3rem;
  font-weight: 600;
}
.workspace {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: minmax(0, auto) minmax(16rem, 1fr);
  align-items: start;
}
@media (max-width: 52rem) {
  .workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}
.board {
  display: grid;
  gap: 0.6rem;
}
.board h2 {
  margin: 0;
  font-size: 1.15rem;
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
}
.pinyin {
  color: var(--muted);
  font-style: italic;
  font-weight: 400;
}
/* the cloth: grey-green felt that goes dark where water touches it */
.cloth {
  position: relative;
  width: min(100%, 34rem, 62vh);
  aspect-ratio: 1;
  display: grid;
  background:
    radial-gradient(ellipse at 35% 25%, rgb(255 255 255 / 0.35), transparent 65%),
    #dcd8c8;
  border: 10px solid var(--mount);
  box-shadow: inset 0 0 18px rgb(60 40 20 / 0.18);
  touch-action: none;
  cursor: crosshair;
  user-select: none;
  -webkit-user-select: none;
}
.cloth.locked {
  cursor: not-allowed;
}
.cloth > * {
  grid-area: 1 / 1;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.grid line {
  stroke: rgb(179 38 30 / 0.28);
  stroke-width: 3;
  stroke-dasharray: 18 14;
}
.guide {
  font-family: var(--brush-font);
  font-size: 760px;
  fill: rgb(29 27 25 / 0.07);
}
.stroke {
  position: relative;
  animation-name: dry;
  animation-timing-function: cubic-bezier(0.5, 0, 0.9, 0.6);
  animation-fill-mode: forwards;
}
/* water dries from dark to nothing; a fade, not a movement, so it stays even
   with reduced motion (it says how long the stroke has left) */
@keyframes dry {
  from {
    opacity: 0.92;
    filter: none;
  }
  to {
    opacity: 0;
    filter: blur(1.5px);
  }
}
.sign {
  position: absolute;
  transform: translate(-50%, -130%);
  font-size: 0.7rem;
  line-height: 1.2;
  padding: 0 0.3rem;
  border-radius: 2px;
  background: var(--seal);
  color: var(--paper);
  white-space: nowrap;
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sign.mine {
  outline: 2px solid var(--paper);
}
.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.side {
  display: grid;
  gap: 1rem;
  align-content: start;
}
.squares {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(3.6rem, 1fr));
  gap: 0.4rem;
}
.square {
  position: relative;
  aspect-ratio: 1;
  padding: 0;
  display: grid;
  place-items: center;
  background: #dcd8c8;
  border: 1px solid var(--rule);
  overflow: hidden;
}
.square > * {
  grid-area: 1 / 1;
  width: 100%;
  height: 100%;
}
.square .model {
  font-family: var(--brush-font);
  font-size: 2.4rem;
  line-height: 1;
  display: grid;
  place-items: center;
  color: rgb(29 27 25 / 0.2);
}
.square.next {
  border: 2px dashed var(--seal);
}
.square[aria-pressed="true"] {
  border: 2px solid var(--ink);
  box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px var(--ink);
}
.who h2 {
  font-size: 1rem;
  margin: 0 0 0.4rem;
}
.who ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.seal-inline {
  background: var(--seal);
  color: var(--paper);
  padding: 0.05rem 0.4rem;
  border-radius: 2px;
  font-size: 0.9rem;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.translation {
  margin: 0;
  font-style: italic;
  color: var(--muted);
}
.problem {
  color: var(--seal);
  font-weight: 600;
  margin: 0;
}
.loading {
  color: var(--muted);
}
</style>
