// "Everyone in the room sees it happen": changes reach every other open
// session within about a second, with nothing for the viewer to do.
import { describe, expect, inject, it } from "vitest";
import { api, DRAWING, freshRoom, openStream, STYLE, type Visitor } from "./helpers.ts";

const baseUrl = inject("baseUrl");
const { visitor, write, call } = api(baseUrl);
const SECOND = 1000;

it("shows a new character to someone else watching within a second", async () => {
  const room = freshRoom();
  const a = await visitor("Bamboo");
  const watcher = await openStream(baseUrl, room);
  try {
    const sent = performance.now();
    expect((await write(room, a)).status).toBe(201);
    const seen = await watcher.waitFor((e) => e.event === "glyph");
    expect(seen.data.glyph.writer.name).toBe("Bamboo");
    expect(seen.at - sent).toBeLessThan(SECOND);
  } finally {
    watcher.close();
  }
});

it("shows everyone a new character with the brush its writer chose", async () => {
  const room = freshRoom();
  const a = await visitor("Bamboo");
  const watcher = await openStream(baseUrl, room);
  try {
    expect((await write(room, a, DRAWING, STYLE)).status).toBe(201);
    const seen = await watcher.waitFor((e) => e.event === "glyph");
    expect(seen.data.glyph.style).toEqual(STYLE);
    expect(seen.data.glyph.strokes).toEqual(DRAWING);
  } finally {
    watcher.close();
  }
});

it("shows who has picked up the brush, and when it's put down", async () => {
  const room = freshRoom();
  const a = await visitor("Bamboo");
  const watcher = await openStream(baseUrl, room);
  try {
    const sent = performance.now();
    await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
    const held = await watcher.waitFor((e) => e.event === "brush" && e.data.brush !== null);
    expect(held.data.brush.holder.name).toBe("Bamboo");
    expect(held.at - sent).toBeLessThan(SECOND);

    const from = watcher.events.length;
    await call("DELETE", `/api/rooms/${room}/brush`, { as: a });
    await watcher.waitFor((e) => e.event === "brush" && e.data.brush === null, SECOND, from);
  } finally {
    watcher.close();
  }
});

it("counts the people in the room, once each", async () => {
  const room = freshRoom();
  const [a, b] = [await visitor("Bamboo"), await visitor("InkFox")];
  const first = await openStream(baseUrl, room, a);
  const secondTab = await openStream(baseUrl, room, a);
  const other = await openStream(baseUrl, room, b);
  try {
    await first.waitFor((e) => e.event === "presence" && e.data.present === 2);
    const from = first.events.length;
    other.close();
    await first.waitFor((e) => e.event === "presence" && e.data.present === 1, 2 * SECOND, from);
  } finally {
    first.close();
    secondTab.close();
    other.close();
  }
});

// Live ink (doc/adr/0002-live-ink.md): while someone holds the brush, the room
// watches their strokes as they draw. A draft is relayed, never stored: only
// the character the writer adds to the scroll is kept.
describe("live ink", () => {
  const STROKE = DRAWING[1];
  const ink = (room: string, as: Visitor | undefined, body: unknown) =>
    call("PUT", `/api/rooms/${room}/ink`, { as, body });

  it("shows the strokes being drawn to someone watching within a second, exactly as drawn", async () => {
    const room = freshRoom();
    const a = await visitor("Bamboo");
    const watcher = await openStream(baseUrl, room);
    try {
      await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
      const sent = performance.now();
      expect((await ink(room, a, { position: 0, strokes: [DRAWING[0]], current: STROKE })).status).toBe(204);
      const seen = await watcher.waitFor((e) => e.event === "ink");
      expect(seen.at - sent).toBeLessThan(SECOND);
      expect(seen.data.writer.name).toBe("Bamboo");
      expect(seen.data.position).toBe(0);
      expect(seen.data.strokes).toEqual([DRAWING[0]]);
      expect(seen.data.current).toEqual(STROKE);
    } finally {
      watcher.close();
    }
  });

  it("shows watchers the brush the writer has set, as they change it", async () => {
    const room = freshRoom();
    const a = await visitor("Bamboo");
    const watcher = await openStream(baseUrl, room);
    try {
      await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
      const sent = performance.now();
      expect((await ink(room, a, { position: 0, strokes: [STROKE], current: null, style: STYLE })).status).toBe(204);
      const seen = await watcher.waitFor((e) => e.event === "ink");
      expect(seen.at - sent).toBeLessThan(SECOND);
      expect(seen.data.style).toEqual(STYLE);
      expect(seen.data.strokes).toEqual([STROKE]);
    } finally {
      watcher.close();
    }
  });

  it("shows an undo or a cleared pad too, since the draft is shown as it is", async () => {
    const room = freshRoom();
    const a = await visitor("Bamboo");
    const watcher = await openStream(baseUrl, room);
    try {
      await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
      expect((await ink(room, a, { position: 0, strokes: [], current: null })).status).toBe(204);
      const seen = await watcher.waitFor((e) => e.event === "ink");
      expect(seen.data.strokes).toEqual([]);
      expect(seen.data.current).toBeNull();
    } finally {
      watcher.close();
    }
  });

  it("never keeps a draft: the scroll holds only the character that was added", async () => {
    const room = freshRoom();
    const a = await visitor("Bamboo");
    await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
    await ink(room, a, { position: 0, strokes: [STROKE], current: null });
    expect((await call("GET", `/api/rooms/${room}`)).json.scroll.glyphs).toEqual([]);

    const final = [DRAWING[0]];
    expect((await call("POST", `/api/rooms/${room}/glyphs`, { as: a, body: { position: 0, strokes: final } })).status).toBe(201);
    expect((await call("GET", `/api/rooms/${room}`)).json.scroll.glyphs[0].strokes).toEqual(final);
  });

  it("takes ink only from whoever holds the brush, for the character they're writing", async () => {
    const room = freshRoom();
    const [a, b] = [await visitor("Bamboo"), await visitor("InkFox")];
    const draft = { position: 0, strokes: [STROKE], current: null };

    expect((await ink(room, undefined, draft)).status).toBe(401);
    expect((await ink(room, a, draft)).json.error).toBe("not_your_brush");

    await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
    expect((await ink(room, b, draft)).json.error).toBe("not_your_brush");
    expect((await ink(room, a, { ...draft, position: 1 })).status).toBe(409);

    // once the character is in, the brush is down and that draft is over
    await call("POST", `/api/rooms/${room}/glyphs`, { as: a, body: { position: 0, strokes: DRAWING } });
    expect((await ink(room, a, draft)).status).toBe(409);
  });

  it("refuses ink that isn't strokes, rather than altering it", async () => {
    const room = freshRoom();
    const a = await visitor("Bamboo");
    await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
    for (const bad of [
      { position: 0, strokes: "a picture", current: null },
      { position: 0, strokes: [{ pts: [1001, 2, 0.5], pen: false }], current: null },
      { position: 0, strokes: [], current: { pts: [1, 2], pen: false } },
      { position: 0, strokes: [] },
      { position: 0, strokes: [], current: null, style: { ...STYLE, wetness: 2 } },
      { position: 0, strokes: [], current: null, style: "wet" },
    ]) {
      const res = await ink(room, a, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });
});
