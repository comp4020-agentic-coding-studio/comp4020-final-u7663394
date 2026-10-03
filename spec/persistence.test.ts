// "It leaves a trace": what was written survives the server dying. This check
// starts its own copy of the server on a throwaway data directory, writes,
// kills it without warning (SIGKILL: no chance to tidy up), starts it again on
// the same directory, and reads back. A redeploy on Fly is the same thing with
// the volume as the directory.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { api, DRAWING, freshRoom } from "./helpers.ts";

const port = 18_000 + Math.floor(Math.random() * 2000);
const baseUrl = `http://localhost:${port}`;
const dataDir = mkdtempSync(join(tmpdir(), "relay-spec-"));
let server: ChildProcess | null = null;

async function start(): Promise<void> {
  server = spawn(process.execPath, ["server/main.ts"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(baseUrl);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("server didn't start");
}

async function kill(): Promise<void> {
  const exited = new Promise((r) => server!.once("exit", r));
  server!.kill("SIGKILL");
  await exited;
}

afterAll(async () => {
  if (server && server.exitCode === null) await kill();
  rmSync(dataDir, { recursive: true, force: true });
});

it("keeps every written character, and who wrote it, across a crash and restart", async () => {
  const { call, visitor, write } = api(baseUrl);
  const room = freshRoom();

  await start();
  const [a, b] = [await visitor("Bamboo"), await visitor("InkFox")];
  expect((await write(room, a)).status).toBe(201);
  expect((await write(room, b)).status).toBe(201);
  await kill();

  await start();
  const { json } = await call("GET", `/api/rooms/${room}`);
  expect(json.scroll.glyphs.map((g: { writer: { name: string } }) => g.writer.name)).toEqual(["Bamboo", "InkFox"]);
  expect(json.scroll.glyphs[0].strokes).toEqual(DRAWING);
  // and a returning browser is still the same person
  expect((await call("GET", "/api/me", { as: a })).json.me.name).toBe("Bamboo");
  // the rules carry over too: InkFox wrote last, so InkFox can't go again
  const again = await call("POST", `/api/rooms/${room}/brush`, { as: b, body: { position: 2 } });
  expect(again.json.error).toBe("pass_the_brush");
}, 30_000);
