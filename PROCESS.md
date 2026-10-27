# Process overview

_Current as of week 12 final version. Rewritten, not appended to, at each crit._

## From the brief to an idea

My first idea was a shared drawing canvas, but r/place showed me that people would fight over space. So I decided to let different people write a line of classical Chinese poetry, one character each, and keep their handwriting. I wrote the idea in `IDEA.md` ([`9abbf52`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/9abbf52)) before choosing the technology, then wrote the README ([`2d5a9fc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/2d5a9fc)). I later turned these ideas into rules in `CLAUDE.md` and tests in `spec/`.

## Why this stack

I explained my choices in [ADR 0001](doc/adr/0001-vue-node-sqlite-sse.md) ([`20dbce0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/20dbce0)). The course provides one 256 MB machine and one volume. Only one person writes at a time, but everyone watching needs to see each update.

- **SQLite on the volume** (`node:sqlite`). I used database constraints, transactions and triggers to keep the data correct.
- **Server-Sent Events and normal requests**. SSE sends updates to everyone and `EventSource` reconnects automatically.
- **Vue 3 and Hono on Node 24, with TypeScript running directly.** The code is simple enough for me to understand and fix.
- **Ink on `<canvas>`** ([ADR 0003](doc/adr/0003-the-writers-brush.md)), because it supports dry-brush effects better than SVG.

The app runs on one machine, which is enough for this small shared writing space.

## Directing the agent

I made each decision in an ADR before writing code. In Crit 8, I added *pass the brush* and rooms. In Crit 9, I added **live ink**, so others can watch the writing without saving the draft ([ADR 0002](doc/adr/0002-live-ink.md), [`36c3712`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/36c3712)). I also improved the brush and saved each person's handwriting ([`40c76db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/40c76db)).

For Crit 10, "fly by instruments", I asked Claude Code to check the app and its deployed logs. The logs were almost empty, and anyone could use "put down the brush" and get a 204 response. I needed to decide how to identify users in logs. IDs are safer, but `flyctl logs` only shows recent logs, and names can repeat. So I used both: `user=` for a short ID and `as=` for the public seal name ([ADR 0004](doc/adr/0004-who-may-change-what.md), [`2e345a3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/2e345a3)). I never log live ink, cookies or stroke points because the README promises not to save drafts.

## The water cloth: making the wait part of the app

In the relay, only one person writes while others may wait for minutes. I asked Claude Code to add a shared drawing canvas. Before coding, it reminded me that my README rejected free canvases because of r/place, and the brief requires reasons for features. I could change the README or design something that followed its idea.

I chose a **water cloth** (水写布) for each room ([ADR 0006](doc/adr/0006-the-water-cloth.md), [`902ed15`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/902ed15)). In Chinese parks, people write poetry on the ground with water, which dries quickly. Vermeeren (2022) found that people in Beijing avoided writing rude things with water. On my cloth, everyone with a name can write together. Each stroke shows its writer and disappears after 90 seconds. Nothing stays, so people have no reason to fight over space. I changed the README from "no free canvas" to "no canvas that keeps" ([`86c35e3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/86c35e3)).

The ADR also explains some design choices:

- One square for each character in the poem, so users can practise the next character.
- A separate page in the navigation, because phones have limited space. It shows the current writer, live ink and when the brush is free.
- Strokes are sent when the pen lifts, reducing network traffic when many people draw.
- Wet strokes are stored in SQLite, so they survive restarts and database rules protect them.

People may still draw rude things, but each stroke has a name and disappears in 90 seconds. I did not add moderation.

## Grounding: rules and checks first

I followed the same order each time: write an ADR, add a README claim, update `CLAUDE.md`, then write tests before fixing the code. For Crit 10, I added claim 7 ([`d3e2143`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/d3e2143)), updated the rules ([`fdb3932`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/fdb3932)), and wrote `access.test.ts` and `log.test.ts` before making the fixes ([`bb3b0ed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/bb3b0ed), [`5b44cb0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/5b44cb0)). For the water cloth, I added claim 8, updated the rules ([`9d14df2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/9d14df2)), and wrote `spec/cloth.test.ts` before the server code ([`86056b7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/86056b7)). I also added a browser test for the page ([`096c2bc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/096c2bc)). It checks that one user writes on the scroll, another uses the cloth, a third sees the signed stroke, and waiting users know when the brush is free ([`d3abc93`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/d3abc93)).

## Corrections

The biggest problems were missed by the passing tests.

- **No way to join.** In Crit 10, a second user could not enter their name while someone else was writing. All API tests passed, but `browser.test.ts` found the problem by testing two users on desktop and mobile. It passed after the fix ([`877aeb2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/877aeb2)).
- **Two unknown users.** Both users appeared as `user=-` in the logs because the stream opened before they entered names. My first fix ([`01dda7a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/01dda7a)) created two streams per page load. Another reload test found this ([`786bdae`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/786bdae)).
- **Tests passing without the feature.** The agent first said all cloth tests failed on the old server. I checked again and found 2 of 13 passed. One treated "no such table" as a valid database rejection, and another never checked if the stroke was accepted. I fixed both tests, and all 13 now fail on the old code ([`7952331`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/7952331)). I learned that every test must fail before the feature is added.

## How I know it works, and what I don't know yet

- `pnpm check`: all 62 tests pass, including 16 for the cloth.
- Tested with two browsers at 1920×1080 and 390×844, using screenshots and server logs.

I still do not know if people will use the cloth while waiting or just watch others write. I also need to test if 30–90 seconds is a good drying time. I hope to find out from real users at the showcase.
