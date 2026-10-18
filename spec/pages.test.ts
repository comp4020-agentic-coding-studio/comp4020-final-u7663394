// The shipped check only asks that / answers 200. A 200 that a browser
// downloads instead of rendering passed it once, so these check that every
// page of the app is served as the app.
import { expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

it.each(["/", "/r/table-4", "/scroll/1", "/cloth", "/r/table-4/cloth"])("serves %s as the app's HTML page", async (path) => {
  const res = await fetch(new URL(path, baseUrl));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/^text\/html/);
  expect(await res.text()).toContain('<div id="app">');
});

it("serves /readme/ as HTML with a way back to the app", async () => {
  const res = await fetch(new URL("/readme/", baseUrl));
  expect(res.headers.get("content-type")).toMatch(/^text\/html/);
  expect(await res.text()).toContain('href="/"');
});

it("answers an unknown API path with a JSON 404, not the app", async () => {
  const res = await fetch(new URL("/api/nothing-here", baseUrl));
  expect(res.status).toBe(404);
  expect((await res.json()).error).toBe("not_found");
});
