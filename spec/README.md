# The spec

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
and its spec are on the course website, along with the specs for crits 8, 9 and
10, which run in this repo. The brief poses the problem; the spec is the fixed
contract.

## What ships

`invariants.test.ts` checks the two things the course relies on:

- `/` answers with a 200, which is what the deploy and the crit capture read
- `/readme/` publishes `README.md`. Markdown renderers all differ slightly, so
  it checks the README's headings rather than every word: each one has to
  appear, in order, in the HTML the server sends, since no script runs. Render
  it however you like, as long as it's there in full; the marker reads it there.

Both run against the **running** app over HTTP, so they hold whatever it's built
with. In CI that app is the image your `Dockerfile` builds, started with a
throwaway `/data`, and a red run blocks the deploy. Locally, start the app
however you run it and `pnpm check` finds it at `APP_URL` (default
`http://localhost:8080`). Keep them; don't delete them.

## Your checks

Everything else in `spec/` is yours to write. Any `spec/*.test.ts` runs with
`pnpm check`, against the same running app. Some lines of a spec only a person
can judge; those are left to the crit and the marker.

At a crit, a green `check` job is half the shipped mark, but it's never the
judgement of the work: your tutor checks what you deployed against the published
spec.

## This app's checks

Each file protects claims from the README's "What good means here". Every check
that writes uses its own fresh `spec-…` room (`helpers.ts`), so the spec can run
against the live app without touching the hall.

| File | README claim | What it checks |
| --- | --- | --- |
| `relay.test.ts` | 1. The brush passes | nobody writes twice in a row; one brush holder; four people reaching at once get exactly one brush; no name, no brush |
| `relay.test.ts` | 2. Ink is kept as drawn | strokes come back exactly as sent; malformed or oversized drawings are refused, never "fixed" |
| `relay.test.ts` | 3. Every character is signed | each glyph carries its writer; a rename doesn't re-sign old characters |
| `relay.test.ts` | 6. It leaves a trace | a finished scroll is kept with every writer named and the next begins; a returning browser is the same person |
| `live.test.ts` | 4. The room sees it happen | a new character, and who holds the brush, reach another open session within a second; presence counts people, not tabs |
| `live.test.ts` | 4. The room sees it happen (live ink) | a stroke being drawn, and an undo, reach another session within a second exactly as drawn; a draft is never stored; only the brush holder, for the character they're on, can send one; malformed ink is refused |
| `persistence.test.ts` | 6. It leaves a trace | characters, writers, identities and the pass-the-brush rule survive the server being SIGKILLed and restarted on the same data directory |
| `pages.test.ts` | (served at all) | `/`, `/r/…`, `/scroll/…` are the app's HTML page; added after a 200 that browsers downloaded passed the shipped check |

Claim 5 (a stranger can join in ten seconds), and whether a scroll of mixed
hands reads as one piece, are judged rather than checked; the README says how.
