<script setup lang="ts">
import { computed, onUnmounted, ref, toRef, watch } from "vue";
import { useRouter } from "vue-router";
import ScrollPaper from "../components/ScrollPaper.vue";
import WritingPad from "../components/WritingPad.vue";
import NameForm from "../components/NameForm.vue";
import { useRoom } from "../useRoom.ts";
import { inkSender, type Draft } from "../liveInk.ts";
import { api, ApiFailure, me } from "../api.ts";
import { characters, textById } from "../../../shared/texts.ts";
import { HALL, ROOM_PATTERN } from "../../../shared/api.ts";
import type { BrushStyle, Stroke } from "../../../shared/strokes.ts";

const props = defineProps<{ room: string }>();
const router = useRouter();
const { state, live, error, skew, announcement, justFinished, ink, refresh } = useRoom(toRef(props, "room"));

const text = computed(() => (state.value ? textById(state.value.scroll.textId) : undefined));
const chars = computed(() => (text.value ? characters(text.value) : []));
const nextPosition = computed(() => state.value?.scroll.glyphs.length ?? 0);
const nextChar = computed(() => chars.value[nextPosition.value]);

// The brush as this browser knows it: kept after the server's hold runs out,
// because until someone else picks it up the character can still be finished.
const holding = ref<{ position: number; scrollId: number } | null>(null);
const busy = ref(false);
const problem = ref<string | null>(null);
const naming = ref(false);
const pad = ref<InstanceType<typeof WritingPad> | null>(null);

watch(
  () => state.value,
  (s) => {
    if (!s) return;
    if (s.me) me.value = s.me;
    const mine = s.brush && s.brush.holder.id === me.value?.id;
    if (mine && !holding.value) holding.value = { position: s.brush!.position, scrollId: s.scroll.id };
    if (holding.value && holding.value.scrollId !== s.scroll.id) holding.value = null;
  },
  { immediate: true },
);

// Someone else took the brush after ours ran out, or our character is in.
watch(
  () => [state.value?.brush, nextPosition.value] as const,
  ([brush, next]) => {
    if (!holding.value) return;
    if (brush && brush.holder.id !== me.value?.id) {
      holding.value = null;
      problem.value = `Your time ran out and ${brush.holder.name} picked up the brush.`;
    } else if (next > holding.value.position) {
      holding.value = null;
    }
  },
);

// Live ink: while we hold the brush, the room watches the pad. A new sender
// for each character, stopped the moment we stop holding it.
let sender: ReturnType<typeof inkSender> | null = null;
let lastDraft: Draft | null = null;
watch(
  holding,
  (h) => {
    sender?.stop();
    sender = h ? inkSender((draft) => api.ink(props.room, draft)) : null;
    lastDraft = null;
  },
  { immediate: true },
);
onUnmounted(() => sender?.stop());
function onDraft(strokes: Stroke[], current: Stroke | null, style: BrushStyle): void {
  if (!holding.value) return;
  lastDraft = { position: holding.value.position, strokes, current, style };
  sender?.push(lastDraft);
}
// The server keeps no drafts, so someone who just arrived, or anyone after a
// reconnect, has none to show: send the draft again whenever the room changes.
watch(
  () => [live.value, state.value?.present] as const,
  ([isLive]) => {
    if (isLive && lastDraft) sender?.push(lastDraft);
  },
);

const iWroteLast = computed(() => !!me.value && state.value?.lastWriter?.id === me.value.id);
const othersBrush = computed(() => {
  const b = state.value?.brush;
  return b && b.holder.id !== me.value?.id ? b : null;
});
const untilOnOurClock = computed(() => {
  const b = state.value?.brush;
  return b && b.holder.id === me.value?.id ? b.until - skew.value : null;
});

async function pickUp(): Promise<void> {
  if (!state.value) return;
  busy.value = true;
  problem.value = null;
  try {
    const { brush } = await api.takeBrush(props.room, nextPosition.value);
    state.value.brush = brush;
    holding.value = { position: brush.position, scrollId: state.value.scroll.id };
  } catch (e) {
    problem.value = (e as Error).message;
    if (e instanceof ApiFailure && e.code !== "network") await refresh();
  } finally {
    busy.value = false;
  }
}

async function putDown(): Promise<void> {
  busy.value = true;
  sender?.stop();
  try {
    await api.putDownBrush(props.room);
  } catch {
    // the hold runs out by itself anyway
  }
  pad.value?.forget();
  holding.value = null;
  busy.value = false;
}

async function submit(strokes: Stroke[], style: BrushStyle): Promise<void> {
  if (!holding.value) return;
  const { position } = holding.value;
  busy.value = true;
  problem.value = null;
  try {
    await api.write(props.room, position, strokes, style);
    pad.value?.forget();
    holding.value = null;
  } catch (e) {
    if (!(e instanceof ApiFailure) || e.code === "network" || e.code === "server_error") {
      problem.value = "Couldn't reach the server. Your character is kept here; try again.";
    } else if (e.code === "stale_position") {
      // Perhaps it did land and only the answer was lost.
      await refresh();
      const landed = state.value?.scroll.glyphs.find((g) => g.position === position);
      if (landed?.writer.id !== me.value?.id) problem.value = e.message;
      pad.value?.forget();
      holding.value = null;
    } else {
      problem.value = e.message;
      if (e.code === "not_your_brush") holding.value = null;
    }
  } finally {
    busy.value = false;
  }
}

const roomLink = computed(() => `${location.origin}${props.room === HALL ? "/" : `/r/${props.room}`}`);
const copied = ref(false);
async function copyLink(): Promise<void> {
  await navigator.clipboard?.writeText(roomLink.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

const newRoom = ref("");
const newRoomValid = computed(() => ROOM_PATTERN.test(newRoom.value));
function openRoom(): void {
  if (newRoomValid.value) void router.push(`/r/${newRoom.value}`);
}

const when = (ms: number): string =>
  new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(ms);
const lineOf = (textId: string): string => textById(textId)?.lines.join("，") ?? textId;
</script>

<template>
  <div class="room">
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>

    <p v-if="error && !state" class="problem" role="alert">{{ error }}</p>
    <p v-else-if="!state" class="loading">Unrolling the scroll…</p>

    <template v-else>
      <section class="intro" aria-labelledby="line-heading">
        <p class="where">
          {{ room === HALL ? "The hall" : `Room “${room}”` }} ·
          <span class="presence">{{ state.present }} {{ state.present === 1 ? "person" : "people" }} here</span>
          · <span class="live" :class="{ down: !live }">{{ live ? "live" : "reconnecting…" }}</span>
        </p>
        <h1 id="line-heading" lang="zh-Hans">{{ text?.lines.join("，") }}</h1>
        <p class="source">
          <span lang="zh-Hans">{{ text?.source }}</span> · {{ text?.sourceEn }}
        </p>
        <p class="translation">“{{ text?.translation }}”</p>
      </section>

      <p v-if="justFinished" class="finished-note" role="status">
        A scroll was just finished here.
        <RouterLink :to="`/scroll/${justFinished}`">See the finished scroll</RouterLink>
      </p>

      <div class="stage" :class="{ writing: holding }">
        <div class="scroll-area">
          <ScrollPaper
            :text-id="state.scroll.textId"
            :glyphs="state.scroll.glyphs"
            :brush="state.brush"
            :ink="ink"
            :me-id="me?.id"
          />
        </div>

        <aside class="panel" aria-label="Your turn">
          <WritingPad
            v-if="holding && nextChar"
            ref="pad"
            :char="nextChar.char"
            :pinyin="nextChar.pinyin"
            :until="untilOnOurClock"
            :sending="busy"
            :problem="problem"
            :draft-key="`relay:draft:${room}:${holding.scrollId}:${holding.position}`"
            @submit="submit"
            @put-down="putDown"
            @draft="onDraft"
          />

          <template v-else>
            <div class="turn" role="status">
              <template v-if="othersBrush">
                <p class="big">
                  <strong>{{ othersBrush.holder.name }}</strong> is writing
                  <span class="char" lang="zh-Hans">{{ chars[othersBrush.position]?.char }}</span>
                </p>
                <p>Watch the scroll: their strokes appear as they write them. You can take the next one.</p>
              </template>
              <template v-else-if="iWroteLast">
                <p class="big">You wrote the last character. The brush passes on.</p>
                <p>
                  Nobody writes two in a row, so this scroll needs someone else next. Share this room with
                  someone nearby.
                </p>
              </template>
              <template v-else-if="nextChar">
                <p class="big">
                  The brush is free. Next:
                  <span class="char" lang="zh-Hans">{{ nextChar.char }}</span>
                  <span class="pinyin">{{ nextChar.pinyin }}</span>
                </p>
                <p>You don't need to read Chinese: a faint model shows each stroke's place.</p>
              </template>
            </div>

            <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

            <NameForm
              v-if="(!me || naming) && !othersBrush && !iWroteLast"
              :prompt="me ? 'Change your name' : 'Choose a name for your seal to write'"
              :submit-label="me ? 'Save' : 'Join in'"
              @done="naming = false"
            />
            <template v-else-if="me">
              <button
                v-if="!othersBrush && !iWroteLast && nextChar"
                type="button"
                class="primary big-button"
                :disabled="busy"
                @click="pickUp"
              >
                Pick up the brush and write <span lang="zh-Hans">{{ nextChar.char }}</span>
              </button>
              <p class="me">
                Writing as <span class="seal-inline">{{ me.name }}</span>
                <button type="button" class="link" @click="naming = true">change</button>
              </p>
            </template>
          </template>

          <section class="share" aria-labelledby="share-heading">
            <h2 id="share-heading">Write with others</h2>
            <p>
              Send this room to people near you:
              <code>{{ roomLink }}</code>
              <button type="button" @click="copyLink">{{ copied ? "Copied" : "Copy link" }}</button>
            </p>
            <form class="new-room" @submit.prevent="openRoom">
              <label for="room-input">Or open a room for your own table</label>
              <div class="row">
                <input
                  id="room-input"
                  v-model.trim="newRoom"
                  placeholder="e.g. table-4"
                  maxlength="32"
                  aria-describedby="room-hint"
                />
                <button type="submit" :disabled="!newRoomValid">Open</button>
              </div>
              <p id="room-hint" class="hint">Lowercase letters, digits and dashes.</p>
            </form>
          </section>
        </aside>
      </div>

      <section class="archive" aria-labelledby="archive-heading">
        <h2 id="archive-heading">Finished in this room</h2>
        <p v-if="!state.finished.length" class="hint">
          Nothing yet. The first finished scroll will be kept here, with every writer's name.
        </p>
        <ol v-else class="finished-list">
          <li v-for="s in state.finished" :key="s.id">
            <RouterLink :to="`/scroll/${s.id}`" lang="zh-Hans">{{ lineOf(s.textId) }}</RouterLink>
            <span class="by">by {{ s.writers.map((w) => w.name).join(", ") }}</span>
            <time :datetime="new Date(s.finishedAt).toISOString()">{{ when(s.finishedAt) }}</time>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>

<style scoped>
.room {
  display: grid;
  gap: 1.25rem;
}
.intro h1 {
  font-family: var(--brush-font);
  font-weight: 400;
  font-size: clamp(1.6rem, 5vw, 2.4rem);
  margin: 0.2rem 0;
  letter-spacing: 0.08em;
}
.where,
.source {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.translation {
  margin: 0.3rem 0 0;
  font-style: italic;
}
.live::before {
  content: "●";
  color: #3c7a3c;
  margin-right: 0.2rem;
}
.live.down::before {
  color: var(--seal);
}
.stage {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 26rem);
  align-items: start;
}
@media (min-width: 80rem) {
  /* the pad and the brush side by side need the room */
  .stage.writing {
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 44rem);
  }
}
@media (max-width: 52rem) {
  .stage {
    grid-template-columns: minmax(0, 1fr);
  }
  /* on a phone, the pad comes before the scroll so it's on screen when your turn starts */
  .stage.writing .panel {
    order: -1;
  }
}
.scroll-area {
  overflow-x: auto;
}
.panel {
  display: grid;
  gap: 1rem;
  align-content: start;
}
.turn p {
  margin: 0.2rem 0;
}
.big {
  font-size: 1.15rem;
}
.char {
  font-family: var(--brush-font);
  font-size: 1.8rem;
  vertical-align: -0.15em;
}
.pinyin {
  color: var(--muted);
  font-style: italic;
}
.big-button {
  font-size: 1.1rem;
  padding: 0.75rem 1rem;
  width: 100%;
}
.me {
  margin: 0;
  font-size: 0.9rem;
  color: var(--muted);
}
.seal-inline {
  background: var(--seal);
  color: var(--paper);
  padding: 0.05rem 0.35rem;
  border-radius: 2px;
}
.share {
  border-top: 1px solid var(--rule);
  padding-top: 0.75rem;
  font-size: 0.9rem;
}
.share h2,
.archive h2 {
  font-size: 1rem;
  margin: 0 0 0.4rem;
}
.share code {
  word-break: break-all;
}
.new-room {
  display: grid;
  gap: 0.3rem;
  margin-top: 0.6rem;
}
.row {
  display: flex;
  gap: 0.5rem;
}
.row input {
  flex: 1;
  min-width: 0;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.finished-list {
  padding-left: 1.25rem;
  display: grid;
  gap: 0.4rem;
}
.finished-list a {
  font-family: var(--brush-font);
  font-size: 1.15rem;
}
.by,
time {
  color: var(--muted);
  font-size: 0.85rem;
  margin-left: 0.5rem;
}
.finished-note {
  margin: 0;
  padding: 0.6rem 0.8rem;
  border-left: 4px solid var(--seal);
  background: var(--paper-deep);
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
