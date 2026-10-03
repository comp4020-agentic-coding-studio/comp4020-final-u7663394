<script setup lang="ts">
import { me } from "./api.ts";
</script>

<template>
  <a class="skip" href="#main">Skip to the scroll</a>
  <header class="site">
    <RouterLink to="/" class="brand">
      <span class="brand-seal" aria-hidden="true">接</span>
      <span>Calligraphy Relay <span lang="zh-Hans" class="zh">书法接力</span></span>
    </RouterLink>
    <nav aria-label="Site">
      <RouterLink to="/">The hall</RouterLink>
      <a href="/readme/">About</a>
      <span v-if="me" class="who">You are <strong>{{ me.name }}</strong></span>
    </nav>
  </header>
  <main id="main" tabindex="-1">
    <RouterView :key="$route.fullPath" />
  </main>
</template>
