<script setup lang="ts">
// One scroll, finished or not, with every hand that wrote it.
import { computed, ref, watch } from "vue";
import ScrollPaper from "../components/ScrollPaper.vue";
import { api, me } from "../api.ts";
import { textById } from "../../../shared/texts.ts";
import { HALL, type Scroll } from "../../../shared/api.ts";

const props = defineProps<{ id: string }>();
const scroll = ref<Scroll | null>(null);
const problem = ref<string | null>(null);

watch(
  () => props.id,
  async (id) => {
    scroll.value = null;
    problem.value = null;
    try {
      scroll.value = (await api.scroll(Number(id))).scroll;
    } catch (e) {
      problem.value = (e as Error).message;
    }
  },
  { immediate: true },
);

const text = computed(() => (scroll.value ? textById(scroll.value.textId) : undefined));
const roomPath = computed(() => (scroll.value?.room === HALL ? "/" : `/r/${scroll.value?.room}`));
const writers = computed(() => {
  const seen = new Map<string, { name: string; chars: string[] }>();
  for (const g of scroll.value?.glyphs ?? []) {
    const entry = seen.get(g.writer.id) ?? { name: g.writer.name, chars: [] };
    entry.chars.push(g.char);
    seen.set(g.writer.id, entry);
  }
  return [...seen.values()];
});
const when = (ms: number): string =>
  new Intl.DateTimeFormat("en-AU", { dateStyle: "long", timeStyle: "short" }).format(ms);
</script>

<template>
  <article class="scroll-page">
    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
    <p v-else-if="!scroll" class="loading">Unrolling the scroll…</p>
    <template v-else>
      <header>
        <h1 lang="zh-Hans">{{ text?.lines.join("，") }}</h1>
        <p class="source"><span lang="zh-Hans">{{ text?.source }}</span> · {{ text?.sourceEn }}</p>
        <p class="translation">“{{ text?.translation }}”</p>
      </header>

      <ScrollPaper :text-id="scroll.textId" :glyphs="scroll.glyphs" :me-id="me?.id" large />

      <section aria-labelledby="hands-heading">
        <h2 id="hands-heading">Written by {{ writers.length }} {{ writers.length === 1 ? "hand" : "hands" }}</h2>
        <ul class="hands">
          <li v-for="w in writers" :key="w.name + w.chars.join('')">
            <span class="seal-inline">{{ w.name }}</span>
            <span lang="zh-Hans" class="chars">{{ w.chars.join(" ") }}</span>
          </li>
        </ul>
        <p class="when">
          <template v-if="scroll.finishedAt">
            Finished <time :datetime="new Date(scroll.finishedAt).toISOString()">{{ when(scroll.finishedAt) }}</time>
          </template>
          <template v-else>Still being written.</template>
          · <RouterLink :to="roomPath">{{ scroll.room === HALL ? "Back to the hall" : `Back to “${scroll.room}”` }}</RouterLink>
        </p>
      </section>
    </template>
  </article>
</template>

<style scoped>
.scroll-page {
  display: grid;
  gap: 1.25rem;
}
h1 {
  font-family: var(--brush-font);
  font-weight: 400;
  font-size: clamp(1.6rem, 5vw, 2.4rem);
  letter-spacing: 0.08em;
  margin: 0;
}
.source {
  color: var(--muted);
  margin: 0.2rem 0;
  font-size: 0.9rem;
}
.translation {
  font-style: italic;
  margin: 0;
}
h2 {
  font-size: 1.05rem;
}
.hands {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.25rem;
}
.seal-inline {
  background: var(--seal);
  color: var(--paper);
  padding: 0.05rem 0.4rem;
  border-radius: 2px;
  margin-right: 0.4rem;
}
.chars {
  font-family: var(--brush-font);
  font-size: 1.2rem;
}
.when {
  color: var(--muted);
  font-size: 0.9rem;
}
.problem {
  color: var(--seal);
  font-weight: 600;
}
.loading {
  color: var(--muted);
}
</style>
