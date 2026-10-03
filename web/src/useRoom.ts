// One room, kept live: the state the server sent, then every event since.
//
// After every (re)connect the room is refetched, because events sent while the
// stream was down are gone. Events that arrive while that fetch is in flight
// are replayed on top of its answer, so nothing written in the gap is lost.
import { onUnmounted, ref, watch, type Ref } from "vue";
import { api } from "./api.ts";
import type { RoomEvents, RoomState } from "../../shared/api.ts";

type Event = { [E in keyof RoomEvents]: { name: E; data: RoomEvents[E] } }[keyof RoomEvents];

export function useRoom(room: Ref<string>) {
  const state = ref<RoomState | null>(null);
  const live = ref(false);
  const error = ref<string | null>(null);
  // server clock minus ours, for brush countdowns
  const skew = ref(0);
  // what screen readers hear when someone else writes
  const announcement = ref("");
  // the scroll that was just finished here, for a "see it" link
  const justFinished = ref<number | null>(null);

  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let buffered: Event[] | null = null;

  function apply(event: Event): void {
    const s = state.value;
    if (!s) return;
    switch (event.name) {
      case "hello":
      case "presence":
        s.present = event.data.present;
        break;
      case "brush":
        s.brush = event.data.brush;
        skew.value = event.data.serverNow - Date.now();
        break;
      case "glyph": {
        const { scrollId, glyph } = event.data;
        if (scrollId === s.scroll.id && !s.scroll.glyphs.some((g) => g.position === glyph.position)) {
          s.scroll.glyphs.push(glyph);
          s.scroll.glyphs.sort((a, b) => a.position - b.position);
        }
        s.lastWriter = { id: glyph.writer.id, name: glyph.writer.name };
        if (glyph.writer.id !== s.me?.id) announcement.value = `${glyph.writer.name} wrote ${glyph.char}.`;
        break;
      }
      case "scroll":
        justFinished.value = event.data.finishedId;
        announcement.value = "The scroll is finished. A new one has begun.";
        void refresh();
        break;
    }
  }

  function receive(event: Event): void {
    if (buffered) buffered.push(event);
    else apply(event);
  }

  async function refresh(): Promise<void> {
    buffered = [];
    try {
      const fresh = await api.room(room.value);
      skew.value = fresh.serverNow - Date.now();
      state.value = fresh;
      error.value = null;
      const pending = buffered;
      buffered = null;
      pending.forEach(apply);
    } catch (e) {
      buffered = null;
      error.value = (e as Error).message;
    }
  }

  function connect(): void {
    disconnect();
    const es = api.events(room.value);
    source = es;
    for (const name of ["hello", "presence", "brush", "glyph", "scroll"] as const) {
      es.addEventListener(name, (msg) => {
        receive({ name, data: JSON.parse((msg as MessageEvent).data) } as Event);
        if (name === "hello") {
          live.value = true;
          void refresh();
        }
      });
    }
    es.onerror = () => {
      live.value = false;
      // The browser retries a dropped stream by itself, but gives up for good
      // on an error response (a deploy in progress, say). Start again later.
      if (es.readyState === EventSource.CLOSED) retry = setTimeout(connect, 3000);
    };
  }

  function disconnect(): void {
    clearTimeout(retry);
    source?.close();
    source = null;
    live.value = false;
  }

  const reconnectIfDown = (): void => {
    if (!live.value) connect();
  };

  watch(
    room,
    () => {
      state.value = null;
      justFinished.value = null;
      void refresh();
      connect();
    },
    { immediate: true },
  );
  window.addEventListener("online", reconnectIfDown);
  // a tab left open overnight, or a phone that slept, comes back to a dead stream
  document.addEventListener("visibilitychange", reconnectIfDown);
  onUnmounted(() => {
    disconnect();
    window.removeEventListener("online", reconnectIfDown);
    document.removeEventListener("visibilitychange", reconnectIfDown);
  });

  return { state, live, error, skew, announcement, justFinished, refresh };
}
