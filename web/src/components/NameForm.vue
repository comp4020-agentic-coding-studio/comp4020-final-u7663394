<script setup lang="ts">
import { ref } from "vue";
import { api, ApiFailure, me } from "../api.ts";
import { NAME_MAX } from "../../../shared/api.ts";

const props = defineProps<{ prompt: string; submitLabel: string }>();
const emit = defineEmits<{ done: [] }>();

const name = ref(me.value?.name ?? "");
const problem = ref<string | null>(null);
const saving = ref(false);

async function save(): Promise<void> {
  saving.value = true;
  problem.value = null;
  try {
    me.value = (await api.setName(name.value)).me;
    emit("done");
  } catch (e) {
    problem.value = e instanceof ApiFailure ? e.message : "Couldn't save that name.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="name-form" @submit.prevent="save">
    <label for="name-input">{{ props.prompt }}</label>
    <div class="row">
      <input
        id="name-input"
        v-model="name"
        :maxlength="NAME_MAX"
        autocomplete="nickname"
        placeholder="e.g. Bamboo"
        required
      />
      <button type="submit" class="primary" :disabled="saving || !name.trim()">{{ props.submitLabel }}</button>
    </div>
    <p class="hint">It goes on your seal beside every character you write. No account, no email.</p>
    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
  </form>
</template>

<style scoped>
.name-form {
  display: grid;
  gap: 0.4rem;
}
label {
  font-weight: 600;
}
.row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
input {
  flex: 1 1 10rem;
  min-width: 0;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.problem {
  margin: 0;
  color: var(--seal);
}
</style>
