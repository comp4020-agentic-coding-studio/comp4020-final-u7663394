// "What's yours stays yours" (README claim 7, doc/adr/0004-who-may-change-what.md):
// the server decides who is asking from the cookie alone, and checks each
// change against that person. Two people, two cookies, as two Chrome profiles
// would be.
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { afterAll, describe, expect, inject, it } from "vitest";
import { api, DRAWING, freshRoom } from "./helpers.ts";
import { ownServer } from "./server.ts";

const baseUrl = inject("baseUrl");
const { call, visitor, write } = api(baseUrl);

describe("who is asking", () => {
  it("is nobody without the cookie, whatever name or id the request carries", async () => {
    const room = freshRoom();
    const a = await visitor("Ada");
    const claims = { position: 0, id: a.id, writer: a, name: "Ada" };
    const take = await call("POST", `/api/rooms/${room}/brush`, { body: claims });
    expect(take.status).toBe(401);
    expect(take.json.error).toBe("name_required");
    const glyph = await call("POST", `/api/rooms/${room}/glyphs`, { body: { ...claims, strokes: DRAWING } });
    expect(glyph.status).toBe(401);
    expect((await call("GET", `/api/rooms/${room}`)).json.brush).toBeNull();
  });

  it("is never someone a forged cookie names", async () => {
    const a = await visitor("Ada");
    for (const cookie of [`relay_visitor=${a.id}`, "relay_visitor=", "relay_visitor=x".padEnd(60, "x")]) {
      const res = await call("GET", "/api/me", { as: { ...a, cookie } });
      expect(res.json.me, cookie).toBeNull();
    }
  });
});

describe("what each person may change", () => {
  it("lets only the holder put the brush down", async () => {
    const room = freshRoom();
    const [a, b] = [await visitor("Ada"), await visitor("Bo")];
    await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });

    const steal = await call("DELETE", `/api/rooms/${room}/brush`, { as: b });
    expect(steal.status).toBe(409);
    expect(steal.json.error).toBe("not_your_brush");
    expect((await call("GET", `/api/rooms/${room}`)).json.brush.holder.id).toBe(a.id);

    expect((await call("DELETE", `/api/rooms/${room}/brush`, { as: a })).status).toBe(204);
    expect((await call("GET", `/api/rooms/${room}`)).json.brush).toBeNull();
  });

  it("refuses to put down a brush that nobody holds, rather than pretending", async () => {
    const room = freshRoom();
    const a = await visitor("Ada");
    const res = await call("DELETE", `/api/rooms/${room}/brush`, { as: a });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("not_your_brush");
  });

  it("won't let anyone write or ink the character someone else holds the brush for", async () => {
    const room = freshRoom();
    const [a, b] = [await visitor("Ada"), await visitor("Bo")];
    await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });

    const write = await call("POST", `/api/rooms/${room}/glyphs`, { as: b, body: { position: 0, strokes: DRAWING } });
    expect(write.json.error).toBe("not_your_brush");
    const ink = await call("PUT", `/api/rooms/${room}/ink`, {
      as: b,
      body: { position: 0, strokes: DRAWING, current: null },
    });
    expect(ink.json.error).toBe("not_your_brush");
    expect((await call("GET", `/api/rooms/${room}`)).json.scroll.glyphs).toEqual([]);
  });

  it("renames only the person asking", async () => {
    const [a, b] = [await visitor("Ada"), await visitor("Bo")];
    const res = await call("PUT", "/api/me", { as: b, body: { name: "Willow", id: a.id } });
    expect(res.json.me).toEqual({ id: b.id, name: "Willow" });
    expect((await call("GET", "/api/me", { as: a })).json.me).toEqual({ id: a.id, name: "Ada" });
  });

  it("has no way to change or remove a written character", async () => {
    const room = freshRoom();
    const a = await visitor("Ada");
    await write(room, a);
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const res = await call(method, `/api/rooms/${room}/glyphs`, { as: a, body: { position: 0, strokes: DRAWING } });
      expect(res.status, method).toBe(404);
    }
    const { json } = await call("GET", `/api/rooms/${room}`);
    expect(json.scroll.glyphs[0].writer.id).toBe(a.id);
    expect(json.scroll.glyphs[0].strokes).toEqual(DRAWING);
  });
});

// The rule lives in the schema too, so a bug or a later endpoint can't break
// it. This opens the database of the spec's own server directly.
describe("the database", () => {
  const server = ownServer();
  afterAll(() => server.stop());

  it("refuses to change or delete a written character, whatever the code does", async () => {
    await server.start();
    const { visitor, write } = api(server.baseUrl);
    const room = freshRoom();
    const a = await visitor("Ada");
    expect((await write(room, a)).status).toBe(201);

    const db = new DatabaseSync(join(server.dataDir, "relay.db"));
    try {
      for (const sql of [
        "UPDATE glyphs SET strokes = '[]'",
        "UPDATE glyphs SET writer_name = 'Bo'",
        "UPDATE glyphs SET style_weight = 0.1",
        "DELETE FROM glyphs",
      ]) {
        expect(() => db.exec(sql), sql).toThrow(/written character/);
      }
      expect(db.prepare("SELECT writer_name FROM glyphs").all()).toEqual([{ writer_name: "Ada" }]);
    } finally {
      db.close();
    }
  }, 30_000);
});
