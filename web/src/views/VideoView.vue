<script setup lang="ts">
// The introduction video. It has sound, so it waits to be played (browsers
// block unmuted autoplay anyway), and preload="none" leaves the 7 MB file
// unread until someone presses play.
</script>

<template>
  <article class="video-page">
    <header>
      <h1>Calligraphy Relay in thirty seconds <span lang="zh-Hans" class="zh">书法接力</span></h1>
      <p class="lede">One brush, one character each, passed around the room until the poem is written.</p>
    </header>

    <div class="frame">
      <video
        src="/promo/intro-web.mp4"
        poster="/promo/cover.jpg"
        controls
        playsinline
        preload="none"
        width="1920"
        height="1080"
        aria-label="Introduction to Calligraphy Relay, 30 seconds, with sound"
      ></video>
    </div>

    <p class="after">
      <RouterLink to="/">Go to the hall and pick up the brush</RouterLink>
      · <a href="/readme/">Read more about it</a>
    </p>
  </article>
</template>

<style scoped>
.video-page {
  display: grid;
  gap: 1.25rem;
  max-width: 60rem;
  margin: 0 auto;
}
h1 {
  font-size: clamp(1.4rem, 4vw, 2rem);
  margin: 0;
}
.lede {
  color: var(--muted);
  margin: 0.3rem 0 0;
}
.frame {
  padding: clamp(0.4rem, 1.5vw, 0.9rem);
  background: var(--mount);
  border-radius: 6px;
  box-shadow: 0 6px 18px rgb(29 27 25 / 0.18);
}
video {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  background: var(--ink);
  border-radius: 3px;
}
.after {
  margin: 0;
  font-size: 0.95rem;
}
</style>
