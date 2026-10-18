# Process overview

_Current as of week 11. Rewritten, not appended to, at each crit. The crit 10 version is the one at the `crit-10` tag._

## From the brief to an idea

My first idea was a shared drawing canvas, but r/place showed that an open canvas becomes a fight over space. So I chose a relay: one line of classical Chinese poetry, written one character at a time by different people, with each person's handwriting kept. I wrote this in `IDEA.md` ([`9abbf52`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/9abbf52)) before choosing any technology, and the README came next ([`2d5a9fc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/2d5a9fc)). Its claims became rules in `CLAUDE.md` and checks in `spec/`.

## Why this stack

The full record is [ADR 0001](doc/adr/0001-vue-node-sqlite-sse.md) ([`20dbce0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/20dbce0)). The course gives one 256 MB machine and one volume, and the traffic is lopsided: one person writes at a time, but every write has to reach everyone watching.

- **SQLite on the volume** (`node:sqlite`), not JSON files or Postgres. The rules that matter live in constraints, transactions and triggers.
- **Server-Sent Events plus ordinary requests**, not WebSockets. Only the fan-out needs pushing, and `EventSource` reconnects by itself.
- **Vue 3 and Hono on Node 24, TypeScript run directly.** I can read and correct every line the agent writes.
- **Ink on `<canvas>`** ([ADR 0003](doc/adr/0003-the-writers-brush.md)), because SVG can't do dry-brush streaks.

One process can't scale past one machine, which fits the "one room, one table" scale.

## Directing the agent

Each step started with a product decision, written as an ADR before any code. Crit 8: *pass the brush* and rooms. Crit 9: **live ink**, where watchers see the strokes but the draft is never stored ([ADR 0002](doc/adr/0002-live-ink.md), [`36c3712`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/36c3712)). Then the writer's own brush, kept with each character ([`40c76db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/40c76db)).

For crit 10, "fly by instruments", I had Claude Code check the app against the crit first, including the deployed log. The log was nearly empty and "put down the brush" answered 204 to anyone. The main question was what the log calls a person. An opaque id is safest, but `flyctl logs` only keeps recent lines, so I would lose which id was who, and names aren't unique. The log uses both: `user=` is a short id and `as=` is the seal name, which is already public on the scroll ([ADR 0004](doc/adr/0004-who-may-change-what.md), [`2e345a3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/2e345a3)). Live ink, cookies and stroke points are never logged, because the README promises a draft is kept nowhere.

## The water cloth: making the wait part of the app

The relay makes people wait: one person writes and everyone else watches, sometimes for minutes. I asked Claude Code for a shared canvas where everyone could draw while waiting. Before writing code, it pointed out that my README rules out a free canvas because of r/place, and the brief takes marks off for features without reasons. So I could drop that part of the README, or build a canvas that fits it.

I chose the second: a **water cloth** (水写布) for each room ([ADR 0006](doc/adr/0006-the-water-cloth.md), [`902ed15`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/902ed15)). In Chinese parks people write poems on the pavement in water (地书), and the characters dry within minutes. Vermeeren (2022), who wrote with them in Beijing, found they refused to use the vanishing water for anything rude. On the cloth, everyone with a name writes at once, each stroke is signed while wet, and it dries within 90 seconds. Nothing is kept, so there is nothing to fight over. The README now says "no canvas that keeps" instead of "no free canvas" ([`86c35e3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/86c35e3)).

The agent's ADR also made smaller choices:

- One square per character of the room's line, so people practise what comes next.
- Its own page, linked from the navigation, since a phone has no space on the room page. It shows who holds the brush and their live ink, and says when the brush is free, so nobody misses a turn.
- A stroke is sent when the pen lifts, not point by point. Many people draw at once here, and streaming every point would multiply the live-ink traffic.
- Wet strokes live in SQLite, so a restart doesn't wipe them and the database refuses changes.

The cost is that free drawing can be rude; it carries a name and is gone in 90 seconds, so there is no moderation.

## Grounding: rules and checks first

The order is the same every time: ADR, README claim, rules in `CLAUDE.md`, then checks that fail before the fix. For crit 10 that was claim 7 ([`d3e2143`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/d3e2143)), the rules ([`fdb3932`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/fdb3932)), then `access.test.ts` and `log.test.ts`, with the fixes after ([`bb3b0ed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/bb3b0ed), [`5b44cb0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/5b44cb0)). For the cloth it was claim 8, the rules ([`9d14df2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/9d14df2)), then `spec/cloth.test.ts` before the server code ([`86056b7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/86056b7)). The page ([`096c2bc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/096c2bc)) has a browser check: one person writes on the scroll, another practises on the cloth, a third sees that stroke signed, and the waiting person is told when the brush is free ([`d3abc93`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/d3abc93)).

## Corrections

The biggest problems were the ones green checks didn't show.

- **Nowhere to join.** In crit 10, a second person who arrived while someone was writing saw no name form. Every API check passed. `browser.test.ts` now plays the crit in two browser contexts at both viewports; it failed, then passed after the fix ([`877aeb2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/877aeb2)).
- **Two nobodies.** In that run's log, both people were `user=-`: the page opened its stream before they chose a name. The fix ([`01dda7a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/01dda7a)) went too far and opened two streams per load, which a reload check caught ([`786bdae`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/786bdae)).
- **Checks that passed without the feature.** The agent first reported that all the new cloth checks failed against the old server. While updating this file, it checked again: 2 of 13 had passed. One accepted "no such table" as the database refusing a change, and one never checked that its stroke was accepted. Both were tightened, and all 13 now fail against the code from before the cloth ([`7952331`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/7952331)). "Watch it fail" means every check, not the file.

## How I know it works, and what I don't know yet

- `pnpm check`: 62 checks pass, 16 of them for the cloth.
- Two-browser runs at 1920×1080 and 390×844, checked as screenshots and in the server log.

I don't know yet if people will use the cloth while they wait or just watch the scroll, or if 30–90 seconds is the right drying time. That needs real users at the showcase.
