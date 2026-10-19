#!/usr/bin/env node
// The multi-user scenarios in docs/testing/multi-user-test-report.md, run
// against the deployed app. Each person is a browser context of their own (no
// shared cookies or storage, as two Chrome profiles are), and every step is
// printed with its UTC time so it can be found in `flyctl logs`. Every room is
// a fresh `mutest-…` one, never the hall.
//
//   node scripts/multi-user-test.ts main                        # a–f
//   node scripts/multi-user-test.ts scale <machine> <machine>   # g, after `fly scale count 2`
//   node scripts/multi-user-test.ts restart <machine>           # h: restarts that machine mid-session
//
// APP_URL points it somewhere else; CHROME_PATH says where Chrome is.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright-core";

const APP = process.env.APP_URL ?? "https://comp4020-final-u7663394.fly.dev";
const FLY_APP = "comp4020-final-u7663394";
const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p): p is string => !!p && existsSync(p));

const DESKTOP = { width: 1920, height: 1080 };
const PHONE = { width: 390, height: 844 };

let failures = 0;
const stamp = (): string => new Date().toISOString().slice(11, 23);
const step = (msg: string): void => console.log(`${stamp()}Z ${msg}`);
const note = (msg: string): void => console.log(`${stamp()}Z      ${msg}`);
function check(what: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`${stamp()}Z   ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` (${detail})` : ""}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Person {
  name: string;
  context: BrowserContext;
  page: Page;
}

async function person(browser: Browser, name: string, viewport: typeof DESKTOP, headers?: Record<string, string>) {
  const context = await browser.newContext({ viewport, extraHTTPHeaders: headers });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  return { name, context, page } as Person;
}

async function join(p: Person): Promise<void> {
  await p.page.getByLabel(/Choose a name/).fill(p.name);
  await p.page.getByRole("button", { name: "Join in" }).click();
  await p.page.getByText(new RegExp(`You are\\s+${p.name}`)).waitFor();
  // the short id the server logs them by
  const id = await p.page.evaluate(async () => (await (await fetch("/api/me")).json()).me.id as string);
  note(`${p.name} is user=${id.slice(0, 8)} (${p.page.viewportSize()!.width}px wide)`);
}

// Whether it shows up within the time, and how long it took.
async function within(locator: Locator, ms = 5000): Promise<number | null> {
  const started = performance.now();
  try {
    await locator.first().waitFor({ timeout: ms });
    return Math.round(performance.now() - started);
  } catch {
    return null;
  }
}
const seen = async (locator: Locator, ms = 5000): Promise<boolean> => (await within(locator, ms)) !== null;

const pad = (page: Page) => page.getByRole("img", { name: /Writing pad/ });
const isWriting = (page: Page, name: string) => page.getByText(new RegExp(`${name}\\s+is writing`));
const writtenBy = (page: Page, name: string) => page.getByRole("img", { name: new RegExp(`written by ${name}$`) });
const people = (page: Page, n: number) => page.locator(".presence", { hasText: new RegExp(`^${n} (person|people) here`) });
// the brush holder's draft, drawn wet in its square on the scroll
const liveInk = (page: Page) => page.locator(".cell .ink.wet");

// A short stroke across the middle of the pad.
async function stroke(page: Page): Promise<void> {
  await pad(page).scrollIntoViewIfNeeded();
  const box = (await pad(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + box.width * (0.25 + i * 0.05), box.y + box.height * (0.5 + (i % 3) * 0.01));
  }
  await page.mouse.up();
}

async function pickUp(p: Person): Promise<void> {
  await p.page.getByRole("button", { name: /Pick up the brush/ }).click();
  await pad(p.page).waitFor();
}

async function writeOne(p: Person): Promise<void> {
  const before = await writtenBy(p.page, p.name).count();
  await pickUp(p);
  await stroke(p.page);
  await p.page.getByRole("button", { name: "Add to the scroll" }).click();
  await writtenBy(p.page, p.name).nth(before).waitFor();
}

async function goto(p: Person, url: string): Promise<void> {
  await p.page.goto(url);
  await p.page.locator(".live", { hasText: /^live$/ }).waitFor();
}

// ---- a–f, one room, as a crit table plays it ----

async function main(browser: Browser): Promise<void> {
  const room = `mutest-${randomBytes(3).toString("hex")}`;
  const url = `${APP}/r/${room}`;
  step(`room=${room}`);

  step("a) Ada and Bo open the room from its URL and join");
  const ada = await person(browser, "Ada", DESKTOP);
  const bo = await person(browser, "Bo", PHONE);
  await goto(ada, url);
  await join(ada);
  await goto(bo, url);
  await join(bo);
  check("Ada's page says 2 people here", await seen(people(ada.page, 2)));
  check("Bo's page says 2 people here", await seen(people(bo.page, 2)));

  step("b) Ada picks up the brush, draws a stroke, then adds the character");
  await pickUp(ada);
  check("Bo is told Ada is writing", await seen(isWriting(bo.page, "Ada")));
  await stroke(ada.page);
  const inkMs = await within(liveInk(bo.page));
  check("Bo sees Ada's stroke live, before it is added", inkMs !== null, `${inkMs} ms after the pen lifted`);
  await ada.page.getByRole("button", { name: "Add to the scroll" }).click();
  const addMs = await within(writtenBy(bo.page, "Ada"), 2000);
  check("Bo sees Ada's character, signed, within 2 s", addMs !== null, `${addMs} ms after the click`);
  const said = await seen(bo.page.locator('p[aria-live="polite"]', { hasText: "Ada wrote" }), 2000);
  check("Bo's aria-live region announces it", said);

  step("c) Cy joins; Bo and Cy press Pick up at the same moment, and Ada (who wrote last) asks the API too");
  const cy = await person(browser, "Cy", DESKTOP);
  await goto(cy, url);
  await join(cy);
  await seen(people(ada.page, 3));
  // both buttons in hand first, then both pressed in the same tick: a
  // careful click would wait, and see the other's brush arrive first
  const sent: string[] = [];
  for (const p of [bo, cy]) {
    p.page.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith("/brush")) sent.push(`${p.name} ${stamp()}Z`);
    });
  }
  const buttons = await Promise.all([bo, cy].map((p) => p.page.getByRole("button", { name: /Pick up the brush/ }).elementHandle()));
  const [, , adaTry] = await Promise.all([
    buttons[0]!.evaluate((b) => (b as HTMLButtonElement).click()),
    buttons[1]!.evaluate((b) => (b as HTMLButtonElement).click()),
    ada.page.evaluate(async (r) => {
      const res = await fetch(`/api/rooms/${r}/brush`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position: 1 }),
      });
      return { status: res.status, error: (await res.json()).error as string };
    }, room),
  ]);
  await sleep(300);
  note(`brush requests sent: ${sent.join(", ")}`);
  await Promise.race([pad(bo.page).waitFor(), pad(cy.page).waitFor()]);
  await sleep(1000);
  const withPad: Person[] = [];
  for (const p of [bo, cy]) if (await pad(p.page).count()) withPad.push(p);
  check("exactly one of Bo and Cy got the brush", withPad.length === 1, withPad.map((p) => p.name).join(", "));
  const winner = withPad[0] ?? bo;
  const loser = winner === bo ? cy : bo;
  check(`${loser.name} is told ${winner.name} is writing`, await seen(isWriting(loser.page, winner.name)));
  const why = (await loser.page.getByRole("alert").allTextContents()).join(" ");
  note(`${loser.name}'s page says: "${why}"`);
  check("Ada was refused: nobody writes two in a row", adaTry.status === 409 && adaTry.error === "pass_the_brush", `${adaTry.status} ${adaTry.error}`);

  step(`d) ${winner.name} draws a stroke; Dee arrives late, with no name yet`);
  await stroke(winner.page);
  await sleep(500);
  const dee = await person(browser, "Dee", PHONE);
  await goto(dee, url);
  check("Dee sees Ada's character, signed", await seen(writtenBy(dee.page, "Ada")));
  check(`Dee is told ${winner.name} is writing`, await seen(isWriting(dee.page, winner.name)));
  check(`Dee sees ${winner.name}'s draft, sent again for the newcomer`, await seen(liveInk(dee.page)));
  check("Dee sees the name form while someone writes", await seen(dee.page.getByLabel(/Choose a name/)));
  await join(dee);
  check("everyone's page says 4 people here", await seen(people(ada.page, 4)), "Ada's");

  step(`e) ${winner.name} closes the tab mid-character, waits, then opens the room again`);
  await winner.page.close();
  check("the others see 3 people here", await seen(people(ada.page, 3)), "Ada's");
  check(`the brush is still ${winner.name}'s on the others' screens`, await seen(isWriting(dee.page, winner.name)), "Dee's");
  await sleep(4000);
  winner.page = await winner.context.newPage();
  await goto(winner, url);
  check(`same person again (the cookie): "You are ${winner.name}"`, await seen(winner.page.getByText(new RegExp(`You are\\s+${winner.name}`))));
  check("still holds the brush: the pad is back", await seen(pad(winner.page)));
  const add = winner.page.getByRole("button", { name: "Add to the scroll" });
  check("the half-written character came back from localStorage", await add.isEnabled());
  check("the others see 4 people again", await seen(people(ada.page, 4)), "Ada's");
  await add.click();
  check(`Ada sees ${winner.name}'s character, signed`, await seen(writtenBy(ada.page, winner.name), 2000));

  step("f) Eve opens another room; Eve and Ada each add a character in their own room at the same time");
  const roomB = `${room}-b`;
  note(`second room=${roomB}`);
  const eve = await person(browser, "Eve", DESKTOP);
  await goto(eve, `${APP}/r/${roomB}`);
  await join(eve);
  check("Eve's page says 1 person here", await seen(people(eve.page, 1)));
  check("Ada's page still says 4 people here", await seen(people(ada.page, 4)));
  await Promise.all([writeOne(eve), writeOne(ada)]);
  check("Bo sees Ada's second character", await seen(writtenBy(bo.page, "Ada").nth(1)));
  await sleep(2000);
  const eveInRoomA = (await writtenBy(bo.page, "Eve").count()) + (await bo.page.getByText("Eve", { exact: true }).count());
  check("nothing of Eve reaches the first room", eveInRoomA === 0);
  check("nothing of the first room reaches Eve", (await writtenBy(eve.page, "Ada").count()) === 0);
  check("Eve's scroll holds only Eve's character", (await eve.page.getByRole("img", { name: /written by/ }).count()) === 1);

  for (const p of [ada, bo, cy, dee, eve]) await p.context.close();
  step("done");
}

// ---- g, two machines ----

async function scale(browser: Browser, machineA: string, machineB: string): Promise<void> {
  const room = `mutest-${randomBytes(3).toString("hex")}`;
  const url = `${APP}/r/${room}`;
  step(`room=${room}; Ada is pinned to ${machineA}, Bo to ${machineB} (fly-force-instance-id)`);
  const ada = await person(browser, "Ada", DESKTOP, { "fly-force-instance-id": machineA });
  const bo = await person(browser, "Bo", PHONE, { "fly-force-instance-id": machineB });

  step("g) both open the same room and join");
  await goto(ada, url);
  await join(ada);
  await goto(bo, url);
  await join(bo);
  await sleep(1500);
  note(`Ada's page: "${await ada.page.locator(".presence").textContent()}"`);
  note(`Bo's page: "${await bo.page.locator(".presence").textContent()}"`);
  check("each sees the other in the room (2 people here)", (await people(ada.page, 2).count()) + (await people(bo.page, 2).count()) === 2);

  step("g) Ada and Bo press Pick up at the same moment");
  const buttons = await Promise.all([ada, bo].map((p) => p.page.getByRole("button", { name: /Pick up the brush/ }).elementHandle()));
  await Promise.all(buttons.map((b) => b!.evaluate((el) => (el as HTMLButtonElement).click())));
  await sleep(1500);
  const both = (await pad(ada.page).count()) === 1 && (await pad(bo.page).count()) === 1;
  check("only one of them holds the brush", !both, both ? "both hold it" : "");

  step("g) each adds the character they are holding");
  for (const p of [ada, bo]) {
    if (await pad(p.page).count()) {
      await stroke(p.page);
      await p.page.getByRole("button", { name: "Add to the scroll" }).click();
      await writtenBy(p.page, p.name).waitFor();
    }
  }
  check("Bo sees Ada's character", await seen(writtenBy(bo.page, "Ada"), 3000));
  check("Ada sees Bo's character", await seen(writtenBy(ada.page, "Bo"), 3000));

  step("g) Ada's cookie, sent to Bo's machine instead");
  const cookie = (await ada.context.cookies()).find((c) => c.name === "relay_visitor")!;
  const res = await fetch(`${APP}/api/me`, {
    headers: { cookie: `${cookie.name}=${cookie.value}`, "fly-force-instance-id": machineB },
  });
  const me = (await res.json()).me as { name: string } | null;
  check("Ada is still Ada on the other machine", me?.name === "Ada", `me=${me ? me.name : "null"}`);

  step("g) ten requests for the room with no machine pinned, as a real browser sends them");
  const answers: string[] = [];
  for (let i = 0; i < 10; i++) {
    const room_ = await (await fetch(`${APP}/api/rooms/${room}`)).json();
    answers.push(room_.scroll.glyphs.map((g: { writer: { name: string } }) => g.writer.name).join("+") || "empty");
  }
  note(`the first character was written by: ${answers.join(", ")}`);
  check("every answer agrees", new Set(answers).size === 1);

  for (const p of [ada, bo]) await p.context.close();
  step("done");
}

// ---- h, the machine restarts while someone is writing ----

async function restart(browser: Browser, machine: string): Promise<void> {
  const room = `mutest-${randomBytes(3).toString("hex")}`;
  const url = `${APP}/r/${room}`;
  step(`room=${room}`);
  const ada = await person(browser, "Ada", DESKTOP);
  const bo = await person(browser, "Bo", PHONE);
  await goto(ada, url);
  await join(ada);
  await goto(bo, url);
  await join(bo);
  await writeOne(ada);
  await pickUp(bo);
  await stroke(bo.page);
  check("Ada sees Bo's live ink before the restart", await seen(liveInk(ada.page)));

  step(`h) fly machine restart ${machine}, with Bo halfway through a character`);
  const started = performance.now();
  const since = (): string => `${((performance.now() - started) / 1000).toFixed(1)} s`;
  const flyctl = promisify(execFile)("mise", ["exec", "--", "flyctl", "machine", "restart", machine, "-a", FLY_APP]);
  const down = (page: Page) => page.locator(".live", { hasText: "reconnecting…" });
  const up = (page: Page) => page.locator(".live", { hasText: /^live$/ });
  const watch = async (p: Person) => {
    const lost = await seen(down(p.page), 60_000);
    note(`${p.name}'s page says "reconnecting…" at ${since()}`);
    const back = await seen(up(p.page), 120_000);
    note(`${p.name}'s page says "live" again at ${since()}`);
    return lost && back;
  };
  const [adaOk, boOk] = await Promise.all([watch(ada), watch(bo)]);
  check("Ada's page showed the connection drop and come back", adaOk);
  check("Bo's page showed the connection drop and come back", boOk);
  const { stdout } = await flyctl;
  note(`flyctl finished at ${since()}: ${stdout.trim().split("\n").pop()}`);

  step("h) after the restart");
  check("Ada's character is still there, signed", await seen(writtenBy(ada.page, "Ada")));
  check("Ada is told Bo is still writing", await seen(isWriting(ada.page, "Bo")));
  check("Bo still holds the brush, with the draft on the pad", (await pad(bo.page).count()) === 1 && (await bo.page.getByRole("button", { name: "Add to the scroll" }).isEnabled()));
  check("Ada sees Bo's draft again, sent again after the reconnect", await seen(liveInk(ada.page)));
  await bo.page.getByRole("button", { name: "Add to the scroll" }).click();
  check("Bo's character is added and reaches Ada", await seen(writtenBy(ada.page, "Bo"), 3000));
  check("both still say 2 people here", (await seen(people(ada.page, 2))) && (await seen(people(bo.page, 2))));

  for (const p of [ada, bo]) await p.context.close();
  step("done");
}

const [scenario, ...machines] = process.argv.slice(2);
if (!CHROME) throw new Error("no Chrome found: set CHROME_PATH");
const browser = await chromium.launch({ executablePath: CHROME });
try {
  step(`${scenario} against ${APP}`);
  if (scenario === "main") await main(browser);
  else if (scenario === "scale" && machines.length === 2) await scale(browser, machines[0], machines[1]);
  else if (scenario === "restart" && machines.length === 1) await restart(browser, machines[0]);
  else throw new Error("usage: multi-user-test.ts main | scale <machine> <machine> | restart <machine>");
} finally {
  await browser.close();
}
console.log(failures ? `${failures} check(s) failed` : "all checks passed");
process.exitCode = failures ? 1 : 0;
