# Process overview

_Current as of crit 9 (week 10). Rewritten, not appended to, at each crit._

## From the brief to an idea

My first idea was a shared drawing canvas, but that is just the drawing version of the chat room the brief warns about, and r/place showed that an open canvas becomes a fight over space. I wanted the group to have to work together, so I chose a relay: one line of classical Chinese poetry, written one character at a time by different people, with each person's handwriting kept. I wrote this in `IDEA.md` ([`9abbf52`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/9abbf52)) before choosing any technology, and the README came next ([`2d5a9fc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/2d5a9fc)). Its six claims became rules in `CLAUDE.md` and checks in `spec/`.

## Why this stack

The full record is [ADR 0001](doc/adr/0001-vue-node-sqlite-sse.md) ([`20dbce0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/20dbce0)). The course gives one 256 MB machine and one volume, and the app's traffic is lopsided: writes are rare because one person writes at a time, but every write has to reach everyone watching.

- **SQLite on the volume** (`node:sqlite`), not JSON files or Postgres. The rules that matter live in constraints and transactions (one character per position, `BEGIN IMMEDIATE` around "take the brush"), which JSON files can't give me.
- **Server-Sent Events plus ordinary requests**, not WebSockets or polling. Only the fan-out needs pushing, and `EventSource` reconnects by itself ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)).
- **Vue 3 and Hono on Node 24, TypeScript run directly.** I can read and correct every line the agent writes. Phoenix LiveView would give me real-time for free, but in a language I don't write.

The cost is that one process can't scale past one machine, which fits the "one room, one table" scale the README argues for.

## Directing the agent

In crit 8 I made the product decisions myself before any code: *pass the brush* (nobody writes two in a row), rooms (`/r/table-4`) so a crowd can split up, and one browser = one person.

For crit 9 the app was already real-time (characters reached other screens in under a second, checked in `spec/live.test.ts`), so the work was the multi-user decision. My crit 8 notes had two candidates: what happens when thirty people want the brush, and whether watchers should see strokes while someone writes. Before writing any code, Claude Code laid out four options against my README and asked me to choose: live ink, a brush queue, the writer choosing who goes next, and a "since you were here" summary for returning visitors. I chose **live ink**, streamed continuously rather than one stroke at a time.

My reason is claim 4, "the room sees it happen". In the crit 8 version a watcher looked at an empty square for up to three minutes and then the finished character appeared. When I tested two sessions side by side, the best part, someone's hand slowly making the character, only happened on one screen. A queue would be fairer in a big crowd, but at a table of three you would hardly notice it, and rooms already split crowds up. The full record, including the options I rejected, is [ADR 0002](doc/adr/0002-live-ink.md) ([`36c3712`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/36c3712)).

The decision has a real cost against my own README. It says handwriting is never judged, and watching someone draft means seeing their false starts and undos. I didn't want to hide that, so I made two choices. The draft is relayed and **never stored**: only the character the writer adds is kept, so the scroll doesn't become a recording of mistakes. And the pad tells the writer that the room is watching. Storing the draft as a replay was the option I liked second, and it's the one I expect my pod to argue for.

## Grounding: rules and checks first

ADR 0001 had already said how to do live strokes if they became part of good: small batches over the same SSE stream, before reaching for WebSockets. So the agent built it that way. Following the `CLAUDE.md` rule, it wrote the new checks first, and four of the five failed with 404 before the endpoint existed (the fifth, "never stored", passes trivially without one). The checks cover a stroke reaching another session within a second, exactly as drawn; an undo showing up; a draft never being stored; and only the brush holder being able to send one. Then came the endpoint ([`c49d23f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/c49d23f)) and the client ([`a8fc3a2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/a8fc3a2)). The new rules ("never keep or replay a draft", "the writer is told") went into `CLAUDE.md` and the spec table ([`cdacd5b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/cdacd5b)), and claim 4 in the README now says what is and isn't kept ([`12872e0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/12872e0)).

## Corrections

The checks were green before the feature was right, like in crit 8 when `/` was a download every check passed ([`0ff6c2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/0ff6c2c)).

- **Wrong copy.** The two-session screenshots showed the watcher panel still saying the character "appears the moment they finish", which live ink made untrue. Only looking at the page caught it.
- **A gap for late joiners.** Killing the server mid-draft showed that after reconnecting, watchers saw nothing until the writer drew again, and the same is true for someone who arrives mid-draft. Keeping drafts on the server would break the rule that the only in-memory state is who is connected, so the writer's page resends its draft when its stream comes back or the number of people changes.
- **A test result that meant nothing.** The first "slow connection" run said an undo reached a throttled watcher in 14 ms, which can't be right with 300 ms of latency. Chrome's throttling doesn't slow an EventSource that is already open. We re-ran it by holding every ink and character request for 400 ms instead, and that rule is now in `CLAUDE.md` so the mistake isn't repeated.

## How I know it works, and what I don't know yet

- `pnpm check`: All 25 checks passed, including 5 new tests for live ink.
- Agent tested two Chrome sessions with Playwright on desktop (1920×1080) and mobile (390×844). The other user could see strokes while drawing, undo worked, and the finished character replaced the wet ink in 34–50 ms. Resizing the pad during drawing also worked. With a 400 ms network delay, the strokes arrived within 517 ms. After stopping the server with SIGKILL, the viewer saw "reconnecting…" and the drawing returned after reconnection.

I still don't know if people will feel nervous when others watch them write. If this happens during the crit, I can change it so strokes only appear after the pen is lifted.
