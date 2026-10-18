# Calligraphy Relay: rules for working on this repo

`README.md` is the argument: what good means for this app. This file is the
rules that follow from it, and `spec/` is the checks. A change that breaks one
of them is wrong even if it works. If a rule here stops making sense, say so and
change the README first, then this file and the spec.

Read before touching the stack, storage, data model or transport:
`doc/adr/`. Decisions change only by writing a new, numbered ADR that
supersedes the old one; an accepted ADR is never edited.

## What the app must never do

- **Let one person write two characters in a row**, or let two people hold the
  brush at once. Both are decided inside a SQLite transaction in
  `server/relay.ts`, never only in the client.
- **Alter a writer's strokes or their brush.** The server validates the shape
  and size of a stroke list and stores it byte for byte, and stores the
  writer's weight, wetness and speed exactly as sent (three `CHECK`ed columns;
  out of range is refused, never clamped). No smoothing, resampling,
  simplifying or "cleaning up" of what is stored or sent, on either side.
  `web/src/ink.ts` may interpolate between the points to *draw* them, never
  to change them. Once a character is added nobody can restyle it, its writer
  included (`doc/adr/0003-the-writers-brush.md`).
- **Draw one character two ways.** `web/src/ink.ts` draws from the stored
  points and brush only. Its randomness is seeded from the strokes, never
  `Math.random()` or the clock, and its sizes are in box units, so another
  screen only changes the resolution.
- **Judge handwriting.** No scores, ratings, likes, rankings, recognition or
  "correctness" feedback on a character, ever. No matching strokes against a
  model character and no redrawing them from a stroke dataset: 墨 Ink, which
  the brush is modelled on, does both, and both are left out.
- **Show a character without its writer**, or re-sign one: a glyph keeps the
  `writer_name` it was written with, even after a rename.
- **Keep or replay a draft.** Live ink (the brush holder's strokes and brush
  settings while they write, `doc/adr/0002-live-ink.md`) is relayed to the
  room and stored nowhere, not in the database and not in memory. Only the
  character the writer adds is kept. Watchers see the draft exactly as it is,
  undos included; it is drawn by the same `web/src/ink.ts`, never tidied.
- **Lose a written character.** A write is answered only after its transaction
  commits. A failed submit keeps the drawing on the pad (and in localStorage)
  so the writer can retry.
- **Let one person change what is another's**
  (`doc/adr/0004-who-may-change-what.md`). Who is asking comes only from the
  `relay_visitor` cookie, never from a name or id in the request body, and is
  checked inside the same transaction as the change. Only you rename yourself
  or put down your brush; nobody changes a written character, its writer
  included (the database refuses `UPDATE` and `DELETE` on `glyphs`). Refuse
  with a code; never answer a refused change as if it worked.
- **Do something nobody can read back from the log.** Every change, every
  refusal and every server error is one `server/log.ts` line on stdout, tagged
  with its request, saying who (`user=` short id, `as=` seal name), what and
  where. Never log the cookie or its token, stroke points, or accepted live
  ink: the log is somewhere, and a draft is kept nowhere. Anything a visitor
  chose (a name, a path) goes through `log.ts` quoting so it can't forge a
  line.
- **Keep what the water cloth was given.** A cloth stroke
  (`doc/adr/0006-the-water-cloth.md`) dries: the server sets its `dries_at`
  (30–90 s, wetter is longer), never returns it after that, and deletes it.
  Until then it is stored exactly as sent, signed with its writer, and only
  that writer may wipe it early; the database refuses `UPDATE` on
  `cloth_strokes`. Per-person and per-room limits refuse with `cloth_full`,
  never by dropping someone else's stroke. Nothing from the cloth ever reaches
  the scroll, and the cloth has no text, likes or scores.
- **Grow accounts, feeds, chat, followers or free-text input** beyond a name
  and a room slug. These are deliberately out of scope (README, "What it
  deliberately leaves out"); propose a README change instead of building them.

## What every page must hold to

- Works at both marking viewports, 390×844 and 1920×1080, including a resize
  in the middle of writing (pad coordinates are normalised per pointer event).
- Every control is a real `<button>`, `<a>` or form field with a visible
  `:focus-visible` style. Drawing needs a pointer; everything else works from
  the keyboard.
- Other people's actions reach the screen without a reload, and are announced
  in the `aria-live` region. The connection state ("live" / "reconnecting…")
  is always visible. Live ink is the exception to announcing: picking up the
  brush and adding a character are announced, single strokes are not.
- Whoever holds the brush is told on the pad that the room is watching, and
  that the brush dials redraw their strokes without moving them.
- Waiting on the water cloth never means missing your turn: its page shows
  who holds the brush, their live ink, and when the brush is free.
- Text for people who don't read Chinese: pinyin, translation and the model
  character accompany every character to be written.
- Everything needed to join is on the page from the URL alone: a browser with
  no name always sees the name form, even while someone else holds the brush.
- Respect `prefers-reduced-motion`.

## Architecture in one breath

Vue 3 + TypeScript client in `web/` (Vite, built to `dist/`). One Node 24
process (`server/main.ts`, TypeScript run directly, no build) with Hono serves
the API, one SSE stream per room (brush, live ink, characters, presence),
`/readme/` (README rendered server-side) and the client. SQLite via
`node:sqlite` at `$DATA_DIR/relay.db` (`/data` on Fly). Types shared by both
sides live in `shared/`. The only in-memory state is who is connected
(`server/hub.ts`); everything else, wet cloth strokes included, is in the
database. Ink is drawn on `<canvas>` by `web/src/ink.ts`, the one place points
become ink. The log is stdout, one `key=value` line per event through
`server/log.ts`; Fly collects it.

- The server runs under Node's type stripping: erasable TypeScript only (no
  `enum`, no parameter properties, no `namespace`), and imports name the file
  with its `.ts` extension.
- Schema changes are a new entry appended to `MIGRATIONS` in `server/db.ts`;
  never edit a shipped migration. Constraints the rules depend on belong in
  the schema, not only in code.
- Every new mutation broadcasts its event to the room *after* it commits.
  Live ink is the one broadcast with no commit behind it: it is checked
  synchronously against the brush holder, so a draft that arrives after its
  character is refused, not shown late.

## Workflow

- `pnpm check` runs against a running app: start one with
  `DATA_DIR=/tmp/relay-dev pnpm start` (after `pnpm build`), never with the
  default `data/` you care about. Spec tests that write use a fresh `spec-…`
  room via `spec/helpers.ts`; keep it that way so the spec can never touch the
  hall.
- A README promise that can be tested gets a test in `spec/` in the same
  change. A promise that can only be judged is listed as judged in the README.
- When a bug gets past the spec, first add the check that would have caught it
  and watch it fail, then fix (see `spec/pages.test.ts`).
- Before saying a UI change works, look at it at both viewports in a real
  browser, with two sessions side by side. Two sessions means two separate
  browser contexts (no shared cookies), as two Chrome profiles are at a crit;
  `spec/browser.test.ts` does this with the Chrome on the machine.
- When the deployed app misbehaves, read its log first
  (`mise exec -- flyctl logs -a comp4020-final-u7663394 --no-tail`) and work
  from the lines around the failure, not from a description of it.
- Browser network throttling doesn't slow events on an EventSource that is
  already open, so a "slow connection" timing taken that way means nothing.
  Delay the requests themselves (e.g. Playwright's `page.route`) and say which
  side was slowed.
- Commits: `scope: imperative description`, small and focused, staged by file
  name, and only when `pnpm check` is green. Never push or deploy; the human
  ships.
- `PROCESS.md` is rewritten (not appended to) at each crit and cites commits
  as links whose text is the hash; `pnpm check:evidence` must pass.
