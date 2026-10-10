# Process overview

_Current as of week 11, after crit 9. Rewritten, not appended to, at each crit._

## From the brief to an idea

My first idea was a shared drawing canvas, but that is just the drawing version of the chat room the brief warns about, and r/place showed that an open canvas becomes a fight over space. I wanted the group to have to work together, so I chose a relay: one line of classical Chinese poetry, written one character at a time by different people, with each person's handwriting kept. I wrote this in `IDEA.md` ([`9abbf52`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/9abbf52)) before choosing any technology, and the README came next ([`2d5a9fc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/2d5a9fc)). Its six claims became rules in `CLAUDE.md` and checks in `spec/`.

## Why this stack

The full record is [ADR 0001](doc/adr/0001-vue-node-sqlite-sse.md) ([`20dbce0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/20dbce0)). The course gives one 256 MB machine and one volume, and the traffic is lopsided: one person writes at a time, but every write has to reach everyone watching.

- **SQLite on the volume** (`node:sqlite`), not JSON files or Postgres. The rules that matter live in constraints and transactions (one character per position, `BEGIN IMMEDIATE` around "take the brush").
- **Server-Sent Events plus ordinary requests**, not WebSockets or polling. Only the fan-out needs pushing, and `EventSource` reconnects by itself.
- **Vue 3 and Hono on Node 24, TypeScript run directly.** I can read and correct every line the agent writes.
- **Ink on `<canvas>`** since this week ([ADR 0003](doc/adr/0003-the-writers-brush.md)). SVG paths can't do dry-brush streaks or ink soaking into paper.

The cost is that one process can't scale past one machine, which fits the "one room, one table" scale the README argues for.

## Directing the agent

In crit 8 I made the product decisions before any code: *pass the brush*, rooms (`/r/table-4`), and one browser = one person. In crit 9 I chose **live ink** over a brush queue, so watchers see the strokes while someone writes, but the draft is never stored ([ADR 0002](doc/adr/0002-live-ink.md), [`36c3712`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/36c3712)).

This week the problem was the ink itself. `perfect-freehand` drew every stroke as one flat black shape, so a scroll looked like it was written with a marker, not a brush. I pointed Claude Code at 墨 Ink, a calligraphy brush engine, and asked for its feel plus weight, wetness and speed dials. Before writing code, the agent read the reference's JavaScript and found it does three things my README rules out: it redraws characters from a dataset of model strokes, reshapes strokes towards a neat "formality", and matches what you wrote against a model character. So we took only the brush: speed sets width, ink runs dry into 飞白 streaks, wet ink bleeds and pools.

The bigger question was who owns the dials. Letting each viewer choose would break "the same on every screen". One brush per scroll would look tidier but takes the choice away from later writers. Saving a brush per person on the server would restyle old characters, which is close to re-signing them. I went with **the writer sets the brush before adding, and it is kept with that character**, like the strokes and the name ([ADR 0003](doc/adr/0003-the-writers-brush.md), [`40c76db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/40c76db)). The cost I accepted is that characters written before this now look different, even though their points haven't changed.

## Grounding: rules and checks first

Following my own `CLAUDE.md`, the README changed first: claim 2 is now "ink is kept as drawn, in the writer's own brush" ([`0d36353`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/0d36353)). Then the rules ([`48f4506`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/48f4506)): the brush is stored exactly and never clamped, drawing may interpolate between points but never change them, and `ink.ts` uses seeded randomness so one character is drawn one way everywhere. Then the checks: seven new or extended tests (brush returned exactly, default brush, bad brushes refused, the brush reaching watchers with the character and with live ink, surviving a crash) failed against the old server before the endpoint changed ([`3ff87f5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/3ff87f5)). The brush lives in three `CHECK`ed columns, so the database also refuses a bad value. Then the canvas brush ([`deb5012`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/deb5012)) and the dials ([`487d6b9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/487d6b9)). Each commit was checked in its own state, not just the last one.

## Corrections

Green checks have meant less than they looked before, like in crit 8 when `/` was a download every check passed ([`0ff6c2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/0ff6c2c)), and in crit 9 when a "slow connection" test had not slowed anything. This week again, only looking at the screen caught most problems.

- **Test input that hid the problem.** Playwright moves the mouse at a constant speed, so the first brush just looked a bit thin. When the agent changed the test strokes to speed up and slow down like a hand, every stroke started with a round "tadpole" blob. We limited how heavy a slow start can get and made pressed starts slanted, like a brush entering on the diagonal (逆锋起笔).
- **Dials below the fold.** At 1920×1080 the sliders were under the bottom of the screen, so you couldn't write, adjust and add without scrolling. They now sit beside the pad on wide screens.
- **A resize test that didn't resize.** Both window sizes hit the pad's size cap, so it proved nothing. Re-run with a size that really shrinks the pad, the stroke stayed in place.
- **An invented fact.** The agent's first ADR draft said people at the crit called the characters "like a font". Nobody said that; it was caught on a reread and taken out before the commit.

## How I know it works, and what I don't know yet

- `pnpm check`: 30 checks pass, including the 5 new ones and 2 extended ones.
- Agent-run Chrome sessions at 1920×1080 and 390×844. The watcher's draft changed when the writer picked a new brush. Two viewers at the same size got pixel-identical characters. A failed submit kept the strokes and the brush through a reload. With the writer's requests held 400 ms, the watcher still ended on the writer's last brush, and the character arrived in about 0.8 s.

I don't know yet whether the dials help people or just make them fuss. I'll watch that at the next crit. I also haven't tested speed on a real phone.
