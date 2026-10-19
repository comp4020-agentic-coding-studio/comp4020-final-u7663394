// "The server log says who did what" (README claim 7, ADR 0004). At a crit the
// log is all I look at while two classmates use the app, so each thing they do
// has to be a line naming them. This runs the spec's own server and reads its
// stdout, which is what `flyctl logs` shows on Fly.
import { afterAll, beforeAll, expect, it } from "vitest";
import { api, DRAWING, freshRoom, openStream } from "./helpers.ts";
import { ownServer } from "./server.ts";

const server = ownServer();
const { call, visitor } = api(server.baseUrl);

beforeAll(() => server.start(), 30_000);
afterAll(() => server.stop());

// The lines logged since `from` that mention this person.
const short = (id: string): string => id.slice(0, 8);
const linesOf = (id: string, from = 0): string[] => server.lines.slice(from).filter((l) => l.includes(`user=${short(id)}`));
// Lines can land just after the response does.
const settle = () => new Promise((r) => setTimeout(r, 50));

it("tells two people apart, and says what each of them did", async () => {
  const room = freshRoom();
  const from = server.lines.length;
  const ada = await visitor("Ada");
  const bo = await visitor("Bo");
  const watching = await openStream(server.baseUrl, room, bo);
  try {
    await call("POST", `/api/rooms/${room}/brush`, { as: ada, body: { position: 0 } });
    await call("POST", `/api/rooms/${room}/glyphs`, { as: ada, body: { position: 0, strokes: DRAWING } });
    await call("POST", `/api/rooms/${room}/brush`, { as: ada, body: { position: 1 } });
    await call("POST", `/api/rooms/${room}/brush`, { as: bo, body: { position: 1 } });
    await call("DELETE", `/api/rooms/${room}/brush`, { as: ada });
  } finally {
    watching.close();
  }
  await settle();

  const adas = linesOf(ada.id, from);
  const bos = linesOf(bo.id, from);
  expect(short(ada.id)).not.toBe(short(bo.id));
  // every line about a person also carries the name on their seal
  for (const l of adas) expect(l).toMatch(/ as=Ada\b/);
  for (const l of bos) expect(l).toMatch(/ as=Bo\b/);

  expect(adas.some((l) => /\bvisitor\.join\b/.test(l))).toBe(true);
  expect(bos.some((l) => /\bvisitor\.join\b/.test(l))).toBe(true);
  expect(bos.some((l) => /\broom\.open\b/.test(l) && l.includes(`room=${room}`))).toBe(true);
  expect(adas.some((l) => /\bbrush\.take\b/.test(l) && l.includes("position=0"))).toBe(true);
  const added = adas.find((l) => /\bglyph\.add\b/.test(l));
  expect(added).toMatch(/position=0 char=\S+ strokes=3 points=8 /);
  // a refusal says why: Ada wrote last, and Bo never held the brush
  expect(adas.some((l) => / 409 /.test(l) && l.includes("error=pass_the_brush"))).toBe(true);
  expect(adas.some((l) => /\bbrush\.take\b/.test(l) && l.includes("position=1"))).toBe(false);
  expect(bos.some((l) => /\bbrush\.take\b/.test(l) && l.includes("position=1"))).toBe(true);
  expect(adas.some((l) => l.includes("DELETE") && l.includes("error=not_your_brush"))).toBe(true);
});

// At a crit the log alone has to show a change reaching the others: who did
// it, then that it went out to everyone watching, and what a latecomer was
// sent when they opened the room.
it("says when a change goes out to the room, and what one person was sent", async () => {
  const room = freshRoom();
  const [a, b] = [await visitor("Ada"), await visitor("Bo")];
  const watching = await openStream(server.baseUrl, room, b);
  try {
    const from = server.lines.length;
    await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
    const draft = { position: 0, strokes: [DRAWING[1]], current: null };
    expect((await call("PUT", `/api/rooms/${room}/ink`, { as: a, body: draft })).status).toBe(204);
    await call("POST", `/api/rooms/${room}/glyphs`, { as: a, body: { position: 0, strokes: DRAWING } });
    await call("GET", `/api/rooms/${room}`, { as: b });
    await settle();
    const lines = server.lines.slice(from);

    // the brush and the character each went out under the request that made them
    const take = lines.find((l) => /\bbrush\.take\b/.test(l) && l.includes(`room=${room}`))!;
    const tag = take.match(/^\[([0-9a-f]{6})\] /)![1];
    expect(lines.some((l) => l.startsWith(`[${tag}] broadcast room=${room} event=brush streams=1 present=1`))).toBe(true);
    expect(lines.some((l) => / broadcast /.test(l) && l.includes(`room=${room} event=glyph streams=1`))).toBe(true);
    // the draft reached Bo, but a draft is kept nowhere, the log included
    await watching.waitFor((e) => e.event === "ink");
    expect(lines.some((l) => l.includes("event=ink"))).toBe(false);
    // what Bo was sent on (re)opening the room, and that it was Bo
    const snapshot = linesOf(b.id, from).find((l) => /\broom\.snapshot\b/.test(l));
    expect(snapshot).toMatch(new RegExp(`room=${room} scroll=\\d+ glyphs=1 brush=- present=1 `));
  } finally {
    watching.close();
  }
});

it("ties each change to the request it happened in", async () => {
  const room = freshRoom();
  const a = await visitor("Ada");
  const from = server.lines.length;
  await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
  await settle();
  const event = linesOf(a.id, from).find((l) => /\bbrush\.take\b/.test(l))!;
  const tag = event.match(/^\[([0-9a-f]{6})\] /)?.[1];
  expect(tag).toBeDefined();
  const request = linesOf(a.id, from).find((l) => l.startsWith(`[${tag}] POST /api/rooms/${room}/brush 200 `));
  expect(request).toBeDefined();
});

it("keeps no secrets and no strokes, and doesn't log a draft", async () => {
  const room = freshRoom();
  const from = server.lines.length;
  const a = await visitor("Ada");
  const token = a.cookie.split("=")[1];
  await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
  const draft = { position: 0, strokes: [DRAWING[1]], current: null };
  expect((await call("PUT", `/api/rooms/${room}/ink`, { as: a, body: draft })).status).toBe(204);
  await call("POST", `/api/rooms/${room}/glyphs`, { as: a, body: { position: 0, strokes: DRAWING } });
  await settle();

  const log = server.lines.slice(from).join("\n");
  expect(log).not.toContain(token);
  expect(log).not.toContain("relay_visitor");
  expect(log).not.toContain(a.id); // the short id only
  // no point of the drawing, in any form
  expect(log).not.toContain("505, 500");
  expect(log).not.toContain("505,500");
  expect(log).not.toMatch(/\bpts\b/);
  // an accepted draft is relayed, never kept, and that includes the log
  expect(log).not.toMatch(/\/ink /);
});

it("logs a refused draft, with who sent it", async () => {
  const room = freshRoom();
  const [a, b] = [await visitor("Ada"), await visitor("Bo")];
  await call("POST", `/api/rooms/${room}/brush`, { as: a, body: { position: 0 } });
  const from = server.lines.length;
  await call("PUT", `/api/rooms/${room}/ink`, { as: b, body: { position: 0, strokes: [], current: null } });
  await settle();
  expect(linesOf(b.id, from).some((l) => /PUT \/api\/rooms\/\S+\/ink 409 /.test(l) && l.includes("error=not_your_brush"))).toBe(
    true,
  );
});

it("won't let a chosen name or path forge a line in the log", async () => {
  const from = server.lines.length;
  const evil = await visitor('Ada" user=00000000');
  // a newline in a path is decoded by the router, so it has to be escaped too
  await fetch(new URL("/api/rooms/x%0A%5Babcdef%5D%20glyph.add%20user=00000000/brush", server.baseUrl), {
    method: "POST",
    headers: { cookie: evil.cookie, "content-type": "application/json" },
    body: "{}",
  });
  await settle();
  const lines = server.lines.slice(from);
  // the name is one quoted value; outside quoted values nobody is user=00000000
  expect(lines.some((l) => l.includes('as="Ada\\" user=00000000"'))).toBe(true);
  const unquoted = lines.map((l) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""'));
  expect(unquoted.filter((l) => l.includes("user=00000000"))).toEqual([]);
  expect(lines.filter((l) => l.startsWith("[abcdef]"))).toEqual([]);
  expect(lines.some((l) => / 400 .*error=invalid_room/.test(l))).toBe(true);
});

it("logs a request the server couldn't read, with who sent it", async () => {
  const a = await visitor("Ada");
  const from = server.lines.length;
  const res = await call("POST", `/api/rooms/${freshRoom()}/brush`, { as: a, raw: "{" });
  expect(res.status).toBe(400);
  await settle();
  expect(linesOf(a.id, from).some((l) => /POST \/api\/rooms\/\S+\/brush 400 .*error=invalid_request/.test(l))).toBe(true);
});
