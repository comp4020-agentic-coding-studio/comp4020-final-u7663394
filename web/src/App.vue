<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { me } from "./api.ts";

// The water cloth belongs to a room: from a room, or its cloth, the link goes
// to that room's cloth; from anywhere else, to the hall's.
const route = useRoute();
const room = computed(() => (typeof route.params.room === "string" ? route.params.room : null));
const hallPath = computed(() => (room.value ? `/r/${room.value}` : "/"));
const clothPath = computed(() => `${hallPath.value === "/" ? "" : hallPath.value}/cloth`);
</script>

<template>
  <a class="skip" href="#main">Skip to the scroll</a>
  <header class="site">
    <RouterLink to="/" class="brand">
      <span class="brand-seal" aria-hidden="true">接</span>
      <span>Calligraphy Relay <span lang="zh-Hans" class="zh">书法接力</span></span>
    </RouterLink>
    <nav aria-label="Site">
      <RouterLink :to="hallPath" exact-active-class="here">{{ room ? "The scroll" : "The hall" }}</RouterLink>
      <RouterLink :to="clothPath" exact-active-class="here">Water cloth</RouterLink>
      <a href="/readme/">About</a>
      <span v-if="me" class="who">You are <strong>{{ me.name }}</strong></span>
    </nav>
  </header>
  <main id="main" tabindex="-1">
    <RouterView :key="$route.fullPath" />
  </main>
</template>
