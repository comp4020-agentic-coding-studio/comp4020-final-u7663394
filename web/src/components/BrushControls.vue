<script setup lang="ts">
// The writer's three dials. They change how the brush draws the strokes on the
// pad, not the strokes: every move redraws the character from the same points.
// The presets are only starting places.
import { DEFAULT_STYLE, type BrushStyle } from "../../../shared/strokes.ts";

const style = defineModel<BrushStyle>({ required: true });
defineProps<{ disabled?: boolean }>();

const PRESETS: { zh: string; en: string; style: BrushStyle }[] = [
  { zh: "楷", en: "even", style: DEFAULT_STYLE },
  { zh: "浓", en: "rich", style: { weight: 0.72, wetness: 0.3, speed: 0.35 } },
  { zh: "淡", en: "light", style: { weight: 0.38, wetness: 0.25, speed: 0.4 } },
  { zh: "干", en: "dry", style: { weight: 0.5, wetness: 0.08, speed: 0.6 } },
  { zh: "润", en: "wet", style: { weight: 0.55, wetness: 0.78, speed: 0.3 } },
];

type Dial = keyof BrushStyle;
const DIALS: { key: Dial; label: string; words: [string, string, string, string, string]; hint: string }[] = [
  {
    key: "weight",
    label: "Weight",
    words: ["very fine", "fine", "medium", "heavy", "very heavy"],
    hint: "how hard the brush presses",
  },
  {
    key: "wetness",
    label: "Wetness",
    words: ["very dry", "dry", "damp", "wet", "very wet"],
    hint: "dry ink breaks into streaks; wet ink bleeds",
  },
  {
    key: "speed",
    label: "Speed",
    words: ["very slow", "slow", "steady", "quick", "very quick"],
    hint: "quick strokes taper and run dry sooner",
  },
];

const word = (dial: (typeof DIALS)[number], value: number): string => dial.words[Math.min(4, Math.floor(value * 5))];
const same = (preset: BrushStyle): boolean =>
  (Object.keys(preset) as Dial[]).every((k) => Math.abs(preset[k] - style.value[k]) < 0.005);

function set(key: Dial, event: Event): void {
  style.value = { ...style.value, [key]: Number((event.target as HTMLInputElement).value) };
}
</script>

<template>
  <fieldset class="brush" :disabled="disabled">
    <legend>Your brush</legend>
    <p class="hint">
      Change it as often as you like before you add the character. It redraws your strokes, never moves them, and the
      room sees it too.
    </p>
    <div class="presets" role="group" aria-label="Brush presets">
      <button
        v-for="p in PRESETS"
        :key="p.en"
        type="button"
        :aria-pressed="same(p.style)"
        @click="style = { ...p.style }"
      >
        <span class="zh" lang="zh-Hans">{{ p.zh }}</span> {{ p.en }}
      </button>
    </div>
    <div v-for="d in DIALS" :key="d.key" class="dial">
      <label :for="`dial-${d.key}`">{{ d.label }}</label>
      <output :for="`dial-${d.key}`">{{ word(d, style[d.key]) }}</output>
      <input
        :id="`dial-${d.key}`"
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="style[d.key]"
        :aria-valuetext="word(d, style[d.key])"
        :aria-describedby="`dial-${d.key}-hint`"
        @input="set(d.key, $event)"
      />
      <span :id="`dial-${d.key}-hint`" class="dial-hint">{{ d.hint }}</span>
    </div>
  </fieldset>
</template>

<style scoped>
.brush {
  border: 1px solid var(--rule);
  border-radius: 4px;
  margin: 0;
  padding: 0.5rem 0.75rem 0.75rem;
  display: grid;
  gap: 0.5rem;
}
legend {
  font-weight: 600;
  padding: 0 0.3rem;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.presets button {
  padding: 0.3rem 0.55rem;
  font-size: 0.85rem;
}
.presets button[aria-pressed="true"] {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--paper);
}
.zh {
  font-family: var(--brush-font);
  font-size: 1.1rem;
  line-height: 1;
}
.dial {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    "label value"
    "slider slider"
    "hint hint";
  align-items: baseline;
}
.dial label {
  grid-area: label;
  font-size: 0.95rem;
}
.dial input {
  grid-area: slider;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  accent-color: var(--seal);
  /* a thumb big enough for a finger */
  min-height: 1.75rem;
  margin-bottom: 0.2rem;
}
.dial output {
  grid-area: value;
  font-size: 0.85rem;
  color: var(--muted);
}
.dial-hint {
  grid-area: hint;
  font-size: 0.78rem;
  color: var(--muted);
}
</style>
