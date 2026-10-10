// The relay's rules (README: "What good means here"), checked against the
// running app. Each test writes only in its own fresh room.
import { describe, expect, inject, it } from "vitest";
import { api, DRAWING, freshRoom, STYLE } from "./helpers.ts";
import { characters, TEXTS } from "../shared/texts.ts";
import { DEFAULT_STYLE } from "../shared/strokes.ts";

const baseUrl = inject("baseUrl");
const { call, visitor, write } = api(baseUrl);

describe("the brush passes", () => {
  it("won't let anyone write two characters in a row", async () => {
    const room = freshRoom();
    const [a, b] = [await visitor("Bamboo"), await visitor("InkFox")];

    expect((await write(room, a)).status).toBe(201);
    const again = await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 1 } });
    expect(again.status).toBe(409);
    expect(again.json.error).toBe("pass_the_brush");

    expect((await write(room, b)).status).toBe(201);
    expect((await write(room, a)).status).toBe(201);
  });

  it("lets only one person hold the brush", async () => {
    const room = freshRoom();
    const [a, b] = [await visitor("Bamboo"), await visitor("InkFox")];

    expect((await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } })).status).toBe(200);
    const taken = await call("POST", `/api/rooms/${room}/brush`, { as: b, body: { position: 0 } });
    expect(taken.status).toBe(409);
    expect(taken.json.error).toBe("brush_taken");
    const sneak = await call("POST", `/api/rooms/${room}/glyphs`, { as: b, body: { position: 0, strokes: DRAWING } });
    expect(sneak.status).toBe(409);
  });

  it("gives the brush to exactly one of two people reaching at once", async () => {
    const room = freshRoom();
    const people = await Promise.all(["A", "B", "C", "D"].map((n) => visitor(n)));
    const tries = await Promise.all(
      people.map((as) => call("POST", `/api/rooms/${room}/brush`, { as, body: { position: 0 } })),
    );
    expect(tries.filter((t) => t.status === 200)).toHaveLength(1);
    expect(tries.filter((t) => t.status === 409)).toHaveLength(3);
  });

  it("needs a name before anyone writes", async () => {
    const room = freshRoom();
    const res = await call("POST", `/api/rooms/${room}/brush`, { body: { position: 0 } });
    expect(res.status).toBe(401);
    expect(res.json.error).toBe("name_required");
  });
});

describe("every hand stays visible", () => {
  it("keeps a character exactly as drawn, signed by its writer", async () => {
    const room = freshRoom();
    const a = await visitor("Bamboo");
    await write(room, a);

    const { json } = await call("GET", `/api/rooms/${room}`);
    const [glyph] = json.scroll.glyphs;
    expect(glyph.writer).toEqual({ id: a.id, name: "Bamboo" });
    expect(glyph.char).toBe(characters(TEXTS[0])[0].char);
    expect(glyph.strokes).toEqual(DRAWING);
  });

  it("keeps the brush a character was written with, exactly as its writer set it", async () => {
    const room = freshRoom();
    const a = await visitor("Bamboo");
    expect((await write(room, a, DRAWING, STYLE)).status).toBe(201);

    const { json } = await call("GET", `/api/rooms/${room}`);
    expect(json.scroll.glyphs[0].style).toEqual(STYLE);
    // the brush changes how the ink is drawn, never the points
    expect(json.scroll.glyphs[0].strokes).toEqual(DRAWING);
  });

  it("draws a character added without brush settings with the default brush", async () => {
    const room = freshRoom();
    const a = await visitor("Bamboo");
    await write(room, a);
    const { json } = await call("GET", `/api/rooms/${room}`);
    expect(json.scroll.glyphs[0].style).toEqual(DEFAULT_STYLE);
  });

  it("refuses brush settings it can't read, rather than adjusting them", async () => {
    const room = freshRoom();
    const a = await visitor("Bamboo");
    await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
    const bad = [
      { ...STYLE, weight: 1.2 },
      { ...STYLE, wetness: -0.1 },
      { ...STYLE, speed: "0.5" },
      { weight: 0.5, wetness: 0.5 },
      [0.5, 0.5, 0.5],
      "rich",
      null,
    ];
    for (const style of bad) {
      const res = await call("POST", `/api/rooms/${room}/glyphs`, { as: a, body: { position: 0, strokes: DRAWING, style } });
      expect(res.status, JSON.stringify(style)).toBe(400);
      expect(res.json.error).toBe("invalid_style");
    }
    const { json } = await call("GET", `/api/rooms/${room}`);
    expect(json.scroll.glyphs).toEqual([]);
  });

  it("keeps the name a character was signed with after a rename", async () => {
    const room = freshRoom();
    const a = await visitor("Bamboo");
    await write(room, a);
    await call("PUT", "/api/me", { as: a, body: { name: "Willow" } });

    const { json } = await call("GET", `/api/rooms/${room}`);
    expect(json.scroll.glyphs[0].writer.name).toBe("Bamboo");
  });

  it("refuses anything that isn't a drawing, rather than altering it", async () => {
    const room = freshRoom();
    const a = await visitor("Bamboo");
    await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
    const bad = [
      [],
      [{ pts: [1, 2], pen: false }],
      [{ pts: [1, 2, 0.5], pen: "yes" }],
      [{ pts: [1001, 2, 0.5], pen: false }],
      [{ pts: [1, 2, 1.5], pen: false }],
      [{ pts: Array.from({ length: 6001 * 3 }, () => 1), pen: false }],
      "a picture",
    ];
    for (const strokes of bad) {
      const res = await call("POST", `/api/rooms/${room}/glyphs`, { as: a, body: { position: 0, strokes } });
      expect(res.status, JSON.stringify(strokes).slice(0, 60)).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
    const { json } = await call("GET", `/api/rooms/${room}`);
    expect(json.scroll.glyphs).toEqual([]);
  });
});

describe("it leaves a trace", () => {
  it("keeps a finished scroll with every writer named, and starts the next", async () => {
    const room = freshRoom();
    const [a, b] = [await visitor("Bamboo"), await visitor("InkFox")];
    const length = characters(TEXTS[0]).length;
    for (let i = 0; i < length; i++) {
      expect((await write(room, i % 2 ? b : a)).status).toBe(201);
    }

    const { json } = await call("GET", `/api/rooms/${room}`);
    expect(json.finished).toHaveLength(1);
    expect(json.finished[0].writers.map((w: { name: string }) => w.name)).toEqual(["Bamboo", "InkFox"]);
    expect(json.scroll.glyphs).toEqual([]);
    expect(json.scroll.textId).toBe(TEXTS[1].id);

    const kept = await call("GET", `/api/scrolls/${json.finished[0].id}`);
    expect(kept.json.scroll.finishedAt).toEqual(expect.any(Number));
    expect(kept.json.scroll.glyphs).toHaveLength(length);
  });

  it("knows a returning visitor by their browser", async () => {
    const a = await visitor("Bamboo");
    const { json } = await call("GET", "/api/me", { as: a });
    expect(json.me).toEqual({ id: a.id, name: "Bamboo" });
  });
});
