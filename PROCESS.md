# Process overview

_Current as of week 11, for crit 10. Rewritten, not appended to, at each crit._

## From the brief to an idea

My first idea was a shared drawing canvas, but that is just the drawing version of the chat room the brief warns about, and r/place showed that an open canvas becomes a fight over space. I wanted the group to have to work together, so I chose a relay: one line of classical Chinese poetry, written one character at a time by different people, with each person's handwriting kept. I wrote this in `IDEA.md` ([`9abbf52`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/9abbf52)) before choosing any technology, and the README came next ([`2d5a9fc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/2d5a9fc)). Its claims became rules in `CLAUDE.md` and checks in `spec/`.

## Why this stack

The full record is [ADR 0001](doc/adr/0001-vue-node-sqlite-sse.md) ([`20dbce0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/20dbce0)). The course gives one 256 MB machine and one volume, and the traffic is lopsided: one person writes at a time, but every write has to reach everyone watching.

- **SQLite on the volume** (`node:sqlite`), not JSON files or Postgres. The rules that matter live in constraints and transactions, and since this week in triggers too.
- **Server-Sent Events plus ordinary requests**, not WebSockets or polling. Only the fan-out needs pushing, and `EventSource` reconnects by itself.
- **Vue 3 and Hono on Node 24, TypeScript run directly.** I can read and correct every line the agent writes.
- **Ink on `<canvas>`** ([ADR 0003](doc/adr/0003-the-writers-brush.md)), because SVG can't do dry-brush streaks.

The cost is that one process can't scale past one machine, which fits the "one room, one table" scale the README argues for.

## Directing the agent

In crit 8 the product decisions came before any code: *pass the brush*, rooms (`/r/table-4`), and one browser = one person. In crit 9 I chose **live ink**: watchers see the strokes while someone writes, but the draft is never stored ([ADR 0002](doc/adr/0002-live-ink.md), [`36c3712`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/36c3712)). Last week the writer got their own brush, kept with each character ([ADR 0003](doc/adr/0003-the-writers-brush.md), [`40c76db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/40c76db)).

This week's brief is "fly by instruments": two classmates use the app from its URL in separate Chrome profiles, and I narrate who did what from the server log only. Before writing anything, I had Claude Code check the app against that crit, including the deployed log. Three problems came up:

- The log was nearly empty. `flyctl logs` showed Fly starting and stopping the machine, and one line per character with a full visitor id. Nobody could narrate a crit from that.
- "Put down the brush" answered 204 to anyone, even someone not holding it. Nothing changed, but a refusal that looks like a success is also a lie in the log.
- A written character couldn't be changed only because no endpoint did it. The database would have let a bug do it.

The main question was what counts as a person and what the log calls them. Accounts would tell humans apart across devices, but the README says a name is the only sign-up, and a stranger at a showcase table won't make an account to write one character. So a person stays a browser with a name, held by a random token in an `HttpOnly` cookie. For the log, an opaque id like the week 10 lecture's example is the safest. But `flyctl logs` only shows recent lines, so I'd lose which id was which person. Names alone aren't unique. The log uses both: `user=` is a short id, which is what the server decides by, and `as=` is the seal name, which is already public on the scroll ([ADR 0004](doc/adr/0004-who-may-change-what.md), [`2e345a3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/2e345a3)).

What is left out of the log mattered as much. Live ink is never logged when it is accepted, because the README promises a draft is kept nowhere, and a log that says "Ada cleared her pad" is somewhere. The cookie and stroke points are never logged. Names and paths are quoted, so nobody can forge a log line by picking a strange name.

## Grounding: rules and checks first

The order was the same as last week. First the ADR, then README claim 7, "what's yours stays yours" ([`d3e2143`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/d3e2143)), then the rules in `CLAUDE.md` ([`fdb3932`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/fdb3932)). Then the checks, which all failed against the old server before any fix: `access.test.ts` (nobody changes another person's things, and the database refuses to change a character), and `log.test.ts`, which starts its own server, reads its stdout and checks the two-person story and what must never appear. The fixes landed with their checks: put-down and the triggers ([`bb3b0ed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/bb3b0ed)), then the log ([`5b44cb0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/5b44cb0)).

## Corrections

Like `/` being a download in crit 8 ([`0ff6c2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/0ff6c2c)), the biggest problems this week were invisible to green checks.

- **Nowhere to join.** The agent opened the room in two separate browsers. When the second person arrived while the first was writing, the page said "Ada is writing" and had no name form at all. At the crit, whoever was a few seconds slower would have been stuck. Every API check passed, because the API was fine. `browser.test.ts` now plays the crit in two browser contexts at both marking viewports. It failed at the second person's join, and passed after the fix ([`877aeb2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/877aeb2)). To be sure the check really tested this, the fix was taken out once more and the check failed again.
- **Two nobodies.** Reading the log of that browser run, `room.open` and `room.close` said `user=-` for both people. The page opens its stream before you choose a name and never reopened it. The browser check now waits for the stream to carry the cookie. It failed first, then passed after the fix ([`01dda7a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/01dda7a), [ADR 0005](doc/adr/0005-watch-as-yourself.md)). That fix went too far: a returning visitor now opened two streams on every load. A reload check caught it with 2 instead of 1 ([`786bdae`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/786bdae)).
- **A record that said too much.** The first ADR 0004 said every room load was logged. It isn't. Because the ADR wasn't pushed yet, the wording was fixed in its own commit instead of shipping a wrong record.

## How I know it works, and what I don't know yet

- `pnpm check`: 46 checks pass, 16 of them new.
- Two-browser runs at 1920×1080 and 390×844, looked at as screenshots. I also read the server log of each run to check I could say who did what from it alone.

I don't know yet if a real log stays readable with six people in the room. That is what the crit will show.
