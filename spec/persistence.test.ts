// "It leaves a trace": what was written survives the server dying. This check
// starts its own copy of the server on a throwaway data directory, writes,
// kills it without warning (SIGKILL: no chance to tidy up), starts it again on
// the same directory, and reads back. A redeploy on Fly is the same thing with
// the volume as the directory.
import { afterAll, expect, it } from "vitest";
import { api, DRAWING, freshRoom, STYLE } from "./helpers.ts";
import { ownServer } from "./server.ts";

const server = ownServer();
afterAll(() => server.stop());

it("keeps every written character, and who wrote it, across a crash and restart", async () => {
  const { call, visitor, write } = api(server.baseUrl);
  const room = freshRoom();

  await server.start();
  const [a, b] = [await visitor("Bamboo"), await visitor("InkFox")];
  expect((await write(room, a, DRAWING, STYLE)).status).toBe(201);
  expect((await write(room, b)).status).toBe(201);
  await server.kill();

  await server.start();
  const { json } = await call("GET", `/api/rooms/${room}`);
  expect(json.scroll.glyphs.map((g: { writer: { name: string } }) => g.writer.name)).toEqual(["Bamboo", "InkFox"]);
  expect(json.scroll.glyphs[0].strokes).toEqual(DRAWING);
  expect(json.scroll.glyphs[0].style).toEqual(STYLE);
  // and a returning browser is still the same person
  expect((await call("GET", "/api/me", { as: a })).json.me.name).toBe("Bamboo");
  // the rules carry over too: InkFox wrote last, so InkFox can't go again
  const again = await call("POST", `/api/rooms/${room}/brush`, { as: b, body: { position: 2 } });
  expect(again.json.error).toBe("pass_the_brush");
}, 30_000);
