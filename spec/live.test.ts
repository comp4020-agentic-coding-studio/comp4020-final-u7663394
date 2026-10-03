// "Everyone in the room sees it happen": changes reach every other open
// session within about a second, with nothing for the viewer to do.
import { expect, inject, it } from "vitest";
import { api, freshRoom, openStream } from "./helpers.ts";

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
