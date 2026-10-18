// "Waiting is writing too" (README claim 8, doc/adr/0006-the-water-cloth.md):
// while one person holds the brush, everyone in the room can practise the line
// on its water cloth at once. A stroke there is signed while it is wet, dries
// within ninety seconds, and is never kept or wiped by anyone but its writer.
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { api, DRAWING, freshRoom, openStream, STYLE } from "./helpers.ts";
import { ownServer } from "./server.ts";
import {
  CLOTH_DRY_MAX_MS,
  CLOTH_DRY_MIN_MS,
  CLOTH_MAX_POINTS,
  CLOTH_PER_PERSON,
  CLOTH_PER_ROOM,
} from "../shared/api.ts";

const baseUrl = inject("baseUrl");
const { call, visitor } = api(baseUrl);
const SECOND = 1000;
const STROKE = DRAWING[1];

// A fresh room starts on the first line of shared/texts.ts, 群贤毕至: any of
// its characters is a square on the cloth.
const firstChar = async (_room: string): Promise<string> => "群";
const wet = (room: string) => call("GET", `/api/rooms/${room}/cloth`);

describe("writing on the cloth", () => {
  it("shows a stroke to everyone watching within a second, exactly as written and signed", async () => {
    const room = freshRoom();
    const a = await visitor("Ada");
    const char = await firstChar(room);
    const watcher = await openStream(baseUrl, room);
    try {
      const sent = performance.now();
      const res = await call("POST", `/api/rooms/${room}/cloth`, { as: a, body: { char, stroke: STROKE, style: STYLE } });
      expect(res.status).toBe(201);
      const seen = await watcher.waitFor((e) => e.event === "cloth");
      expect(seen.at - sent).toBeLessThan(SECOND);
      const { stroke } = seen.data;
      expect(stroke.writer).toEqual({ id: a.id, name: "Ada" });
      expect(stroke.char).toBe(char);
      expect(stroke.stroke).toEqual(STROKE);
      expect(stroke.style).toEqual(STYLE);
      // and anyone loading the room later sees the same
      expect((await wet(room)).json.strokes).toEqual([stroke]);
    } finally {
      watcher.close();
    }
  });

  it("lets everyone write at once, the brush holder and the last writer included", async () => {
    const room = freshRoom();
    const [a, b, c] = [await visitor("Ada"), await visitor("Bo"), await visitor("Cy")];
    const char = await firstChar(room);
    await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
    const results = await Promise.all(
      [a, b, c, b].map((as) => call("POST", `/api/rooms/${room}/cloth`, { as, body: { char, stroke: STROKE } })),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect((await wet(room)).json.strokes.map((s: { writer: { name: string } }) => s.writer.name).sort()).toEqual([
      "Ada",
      "Bo",
      "Bo",
      "Cy",
    ]);
  });

  it("dries every stroke within ninety seconds, a wetter brush later", async () => {
    const room = freshRoom();
    const a = await visitor("Ada");
    const char = await firstChar(room);
    const write = async (wetness: number) =>
      (
        await call("POST", `/api/rooms/${room}/cloth`, {
          as: a,
          body: { char, stroke: STROKE, style: { ...STYLE, wetness } },
        })
      ).json.stroke;
    const [dry, soaked] = [await write(0), await write(1)];
    for (const s of [dry, soaked]) {
      expect(s.driesAt - s.writtenAt).toBeGreaterThanOrEqual(CLOTH_DRY_MIN_MS);
      expect(s.driesAt - s.writtenAt).toBeLessThanOrEqual(CLOTH_DRY_MAX_MS);
    }
    expect(soaked.driesAt - soaked.writtenAt).toBeGreaterThan(dry.driesAt - dry.writtenAt);
  });

  it("never touches the scroll: practice isn't a character", async () => {
    const room = freshRoom();
    const a = await visitor("Ada");
    await call("POST", `/api/rooms/${room}/cloth`, { as: a, body: { char: await firstChar(room), stroke: STROKE } });
    const { json } = await call("GET", `/api/rooms/${room}`);
    expect(json.scroll.glyphs).toEqual([]);
    expect(json.brush).toBeNull();
    expect(json.lastWriter).toBeNull();
  });
});

describe("what the cloth refuses", () => {
  it("needs a name, like the brush does", async () => {
    const room = freshRoom();
    const res = await call("POST", `/api/rooms/${room}/cloth`, { body: { char: await firstChar(room), stroke: STROKE } });
    expect(res.status).toBe(401);
    expect(res.json.error).toBe("name_required");
  });

  it("refuses a stroke or brush it can't read, or a square not on the line, rather than fixing it", async () => {
    const room = freshRoom();
    const a = await visitor("Ada");
    const char = await firstChar(room);
    const long = { pts: Array.from({ length: (CLOTH_MAX_POINTS + 1) * 3 }, (_, i) => (i % 3 === 2 ? 0.5 : 500)), pen: false };
    for (const bad of [
      { char, stroke: { pts: [1001, 2, 0.5], pen: false } },
      { char, stroke: { pts: [1, 2], pen: false } },
      { char, stroke: [STROKE] },
      { char, stroke: long },
      { char, stroke: STROKE, style: { ...STYLE, wetness: 1.5 } },
      { char, stroke: STROKE, style: "wet" },
      { char: "龍", stroke: STROKE },
      { char: 0, stroke: STROKE },
    ]) {
      const res = await call("POST", `/api/rooms/${room}/cloth`, { as: a, body: bad });
      expect(res.status, JSON.stringify(bad).slice(0, 80)).toBe(400);
    }
    expect((await wet(room)).json.strokes).toEqual([]);
  });

  it("stops one person filling the cloth, without drying anyone else's strokes", async () => {
    const room = freshRoom();
    const [a, b] = [await visitor("Ada"), await visitor("Bo")];
    const char = await firstChar(room);
    await call("POST", `/api/rooms/${room}/cloth`, { as: b, body: { char, stroke: STROKE } });
    for (let i = 0; i < CLOTH_PER_PERSON; i++) {
      expect((await call("POST", `/api/rooms/${room}/cloth`, { as: a, body: { char, stroke: STROKE } })).status).toBe(201);
    }
    const over = await call("POST", `/api/rooms/${room}/cloth`, { as: a, body: { char, stroke: STROKE } });
    expect(over.status).toBe(409);
    expect(over.json.error).toBe("cloth_full");
    const strokes = (await wet(room)).json.strokes as { writer: { id: string } }[];
    expect(strokes.filter((s) => s.writer.id === b.id)).toHaveLength(1);
    // and the room as a whole has room for more people than one
    expect(CLOTH_PER_ROOM).toBeGreaterThan(CLOTH_PER_PERSON);
  });
});

describe("what's yours on the cloth", () => {
  it("lets only the writer dry their strokes early, and tells the room", async () => {
    const room = freshRoom();
    const [a, b] = [await visitor("Ada"), await visitor("Bo")];
    const char = await firstChar(room);
    const mine = (await call("POST", `/api/rooms/${room}/cloth`, { as: a, body: { char, stroke: STROKE } })).json.stroke;
    const theirs = (await call("POST", `/api/rooms/${room}/cloth`, { as: b, body: { char, stroke: STROKE } })).json.stroke;
    const watcher = await openStream(baseUrl, room);
    try {
      // a stroke id in the body names nobody's stroke but your own
      const res = await call("DELETE", `/api/rooms/${room}/cloth`, { as: b, body: { ids: [mine.id] } });
      expect(res.status).toBe(200);
      expect(res.json.ids).toEqual([theirs.id]);
      const seen = await watcher.waitFor((e) => e.event === "cloth_wipe");
      expect(seen.data).toEqual({ writer: { id: b.id, name: "Bo" }, ids: [theirs.id] });
      expect((await wet(room)).json.strokes.map((s: { id: number }) => s.id)).toEqual([mine.id]);

      // nothing left to dry is a refusal, not a pretend success
      const again = await call("DELETE", `/api/rooms/${room}/cloth`, { as: b });
      expect(again.status).toBe(409);
      expect(again.json.error).toBe("nothing_wet");
      expect((await call("DELETE", `/api/rooms/${room}/cloth`)).status).toBe(401);
    } finally {
      watcher.close();
    }
  });

  it("has no way to change a stroke on the cloth", async () => {
    const room = freshRoom();
    const a = await visitor("Ada");
    await call("POST", `/api/rooms/${room}/cloth`, { as: a, body: { char: await firstChar(room), stroke: STROKE } });
    for (const method of ["PUT", "PATCH"]) {
      const res = await call(method, `/api/rooms/${room}/cloth`, { as: a, body: { stroke: DRAWING[0] } });
      expect(res.status, method).toBe(404);
    }
    expect((await wet(room)).json.strokes[0].stroke).toEqual(STROKE);
  });
});

// What only the server's own database and stdout can show: a dry stroke is
// gone, a wet one outlives a restart, the database refuses to change one, and
// the log names who wrote on the cloth but never their points.
describe("the cloth, from the inside", () => {
  const server = ownServer();
  beforeAll(() => server.start(), 30_000);
  afterAll(() => server.stop());

  it("never shows a stroke once it has dried, and sweeps it away", async () => {
    const { call, visitor } = api(server.baseUrl);
    const room = freshRoom();
    const a = await visitor("Ada");
    await call("POST", `/api/rooms/${room}/cloth`, { as: a, body: { char: "群", stroke: STROKE } });

    const db = new DatabaseSync(join(server.dataDir, "relay.db"));
    try {
      // a stroke that dried a moment ago, as if written ninety seconds back
      const past = Date.now() - 1000;
      db.prepare(
        `INSERT INTO cloth_strokes (room, char, writer_id, writer_name, stroke, style_weight, style_wetness,
                                    style_speed, written_at, dries_at)
         VALUES (?, '群', ?, 'Ada', ?, 0.5, 0.5, 0.5, ?, ?)`,
      ).run(room, a.id, JSON.stringify(DRAWING[0]), past - CLOTH_DRY_MAX_MS, past);
      const shown = (await call("GET", `/api/rooms/${room}/cloth`)).json.strokes;
      expect(shown.map((s: { stroke: unknown }) => s.stroke)).toEqual([STROKE]);
      // the next write sweeps the dry one out of the database too
      await call("POST", `/api/rooms/${room}/cloth`, { as: a, body: { char: "群", stroke: STROKE } });
      const left = db.prepare("SELECT count(*) AS n FROM cloth_strokes WHERE dries_at <= ?").get(Date.now()) as {
        n: number;
      };
      expect(left.n).toBe(0);
    } finally {
      db.close();
    }
  });

  it("refuses to change a wet stroke, whatever the code does", async () => {
    const { call, visitor } = api(server.baseUrl);
    const room = freshRoom();
    const a = await visitor("Ada");
    await call("POST", `/api/rooms/${room}/cloth`, { as: a, body: { char: "群", stroke: STROKE } });
    const db = new DatabaseSync(join(server.dataDir, "relay.db"));
    try {
      for (const sql of [
        "UPDATE cloth_strokes SET stroke = '[]'",
        "UPDATE cloth_strokes SET writer_name = 'Bo'",
        "UPDATE cloth_strokes SET dries_at = dries_at + 999999",
      ]) {
        expect(() => db.exec(sql), sql).toThrow(/cloth/);
      }
    } finally {
      db.close();
    }
  });

  it("keeps a wet stroke through a restart, until it dries", async () => {
    const { call, visitor } = api(server.baseUrl);
    const room = freshRoom();
    const a = await visitor("Ada");
    await call("POST", `/api/rooms/${room}/cloth`, { as: a, body: { char: "群", stroke: STROKE, style: STYLE } });
    await server.kill();
    await server.start();
    const [kept] = (await call("GET", `/api/rooms/${room}/cloth`)).json.strokes;
    expect(kept.stroke).toEqual(STROKE);
    expect(kept.style).toEqual(STYLE);
    expect(kept.writer.name).toBe("Ada");
  }, 30_000);

  it("logs who wrote on which square, and who dried theirs, never the points", async () => {
    const { call, visitor } = api(server.baseUrl);
    const room = freshRoom();
    const a = await visitor("Ada");
    const from = server.lines.length;
    await call("POST", `/api/rooms/${room}/cloth`, { as: a, body: { char: "群", stroke: STROKE } });
    await call("DELETE", `/api/rooms/${room}/cloth`, { as: a });
    await new Promise((r) => setTimeout(r, 50));
    const lines = server.lines.slice(from).filter((l) => l.includes(`user=${a.id.slice(0, 8)}`));
    expect(lines.some((l) => /\bcloth\.write\b/.test(l) && l.includes("char=群") && l.includes("points=3"))).toBe(true);
    expect(lines.some((l) => /\bcloth\.wipe\b/.test(l) && l.includes("strokes=1"))).toBe(true);
    for (const l of lines) expect(l).toMatch(/ as=Ada\b/);
    const log = server.lines.slice(from).join("\n");
    expect(log).not.toContain("505, 500");
    expect(log).not.toContain("505,500");
    expect(log).not.toMatch(/\bpts\b/);
  });
});
