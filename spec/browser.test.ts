// The crit, as a check: two people open a room from its URL alone, each in a
// browser context of their own (no shared cookies or storage, as two Chrome
// profiles are), one at each marking viewport. Added after a newcomer who
// arrived while someone else was writing found no way to join: every API check
// passed, because the API was fine and the page hid the name form.
//
// Drives the Chrome already on the machine (GitHub's runner has one), so
// nothing is downloaded. Set CHROME_PATH if it lives somewhere else.
import { existsSync } from "node:fs";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { freshRoom } from "./helpers.ts";

const baseUrl = inject("baseUrl");

const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
].find((p): p is string => !!p && existsSync(p));

let browser: Browser;
beforeAll(async () => {
  // CI runners don't allow Chrome's sandbox; a desktop does
  if (CHROME) browser = await chromium.launch({ executablePath: CHROME, chromiumSandbox: !process.env.CI });
}, 30_000);
afterAll(() => browser?.close());

async function person(width: number, height: number): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  // a step that fails says which, well inside the test's own timeout
  page.setDefaultTimeout(5000);
  return page;
}

async function join(page: Page, name: string): Promise<void> {
  await page.getByLabel(/Choose a name/).fill(name);
  await page.getByRole("button", { name: "Join in" }).click();
}

// A short stroke across the middle of the pad.
async function stroke(page: Page): Promise<void> {
  const pad = page.getByRole("img", { name: /Writing pad/ });
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + box.width * (0.25 + i * 0.05), box.y + box.height * (0.5 + (i % 3) * 0.01));
  }
  await page.mouse.up();
}

it.skipIf(!CHROME)(
  "lets two separate browsers join from the URL alone and see each other's character, signed",
  async () => {
    const url = new URL(`/r/${freshRoom()}`, baseUrl).href;
    const ada = await person(1920, 1080);
    const bo = await person(390, 844);

    await ada.goto(url);
    await join(ada, "Ada");
    await ada.getByRole("button", { name: /Pick up the brush/ }).click();
    await ada.getByRole("heading", { name: /Write/ }).waitFor();

    // Bo arrives while Ada is writing, and can still join from the page
    await bo.goto(url);
    await bo.getByText(/Ada\s+is writing/).waitFor();
    await join(bo, "Bo");
    await expect.poll(() => bo.getByText(/You are\s+Bo/).count()).toBe(1);

    // Ada's character reaches Bo without a reload, with her seal on it
    await stroke(ada);
    await ada.getByRole("button", { name: "Add to the scroll" }).click();
    await bo.getByRole("img", { name: /written by Ada/ }).waitFor({ timeout: 2000 });

    // and Bo, not Ada, may write the next one
    await bo.getByRole("button", { name: /Pick up the brush/ }).click();
    await bo.getByRole("heading", { name: /Write/ }).waitFor();
    await ada.getByText(/Bo\s+is writing/).waitFor({ timeout: 2000 });
    await expect.poll(() => ada.getByRole("button", { name: /Pick up the brush/ }).count()).toBe(0);
  },
  30_000,
);
