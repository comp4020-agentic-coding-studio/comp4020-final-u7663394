# Process overview

_Current as of crit 8 (week 9). Rewritten, not appended to, at each crit._

## From the brief to an idea

The brief asks for a multi-user, real-time site that's good, and warns against
the median answer: a chat room with the nouns swapped. My first instinct was a
shared drawing canvas, which is the drawing version of the same median answer.
Anyone can draw anywhere, and r/place showed that at scale this becomes a fight
over territory. What I wanted instead was a shape where the group *has* to
collaborate: a relay. One line of classical Chinese poetry, one character per
person, with each person's hand kept visible. I wrote this up in `IDEA.md`
([`9abbf52`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/9abbf52))
before choosing any technology, so the stack would follow from the idea rather
than the other way round.

## Directing the agent: the decisions I kept

I gave Claude Code the brief, the crit 8 spec and `IDEA.md`. I told it the
frontend would be Vue 3 + TypeScript, because that's what I can read and correct.
Before any code, it asked me three product questions, and I decided each one
because each changes what "good" means:

- **How strict is the relay?** I chose *pass the brush*: nobody writes two
  characters in a row, so a scroll can't be finished alone. A softer rule (the
  brush unlocks after a minute) would never stall, but it would make "the
  artwork depends on the group" false. A rule of one character per person would
  stop a pod of four finishing a ten-character line.
- **Where do people write?** A shared hall at `/`, plus named rooms
  (`/r/table-4`), so a showcase crowd can split into tables instead of queueing
  for one brush. Rooms also let the spec write into throwaway `spec-…` rooms and
  never touch the real scroll.
- **What is a person?** One per browser: a pseudonym tied to a long-lived
  cookie, so you're still you tomorrow. The cost is that two tabs in one browser
  are the same person. I accepted that, and the UI says so when you wrote last.

The README came first
([`2d5a9fc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/2d5a9fc)).
Its six claims became the rules in `CLAUDE.md` and the checks in `spec/`.

I didn't trust sources the agent produced from memory. A separate sub-agent
fetched every URL before I cited it. That caught two problems. The Orchid
Pavilion gathering was forty-two literati, not all of whom wrote poems, so my
"forty poets" was wrong. And a museum quote I wanted for 字如其人 ("the writing
is like the person") turned out to be a search-summary paraphrase, so I dropped
the attribution rather than cite something I couldn't read.

## Why this stack

The full record is [ADR 0001](doc/adr/0001-vue-node-sqlite-sse.md)
([`20dbce0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/20dbce0)).
In short, the course fixes one 256 MB machine and one volume, and the app's
traffic is lopsided. Writes are rare, one person at a time, while reads fan out
to everyone watching.

- **SQLite on the volume** (through Node's built-in `node:sqlite`) rather than
  JSON files or Postgres. The rules that matter are constraints and
  transactions: `PRIMARY KEY (scroll_id, position)`, a partial unique index for
  one open scroll per room, and `BEGIN IMMEDIATE` around "take the brush". JSON
  files would put those rules in application code with no atomicity. Postgres is
  outside the course setup, and SQLite's own guidance fits a single-writer site
  this size ([Appropriate Uses](https://www.sqlite.org/whentouse.html)). The
  database lives on the volume, the only storage that survives a redeploy
  ([Fly Volumes](https://docs.fly.io/volumes/overview)). Migrations run at boot,
  because Fly's release machine has no volume.
- **Server-Sent Events plus POSTs** rather than WebSockets or polling. Every
  write is already request/response, so only the fan-out needs pushing.
  `EventSource` reconnects by itself
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)),
  which matters on the slow connections markers try. WebSockets would be a
  second protocol I'd have to write reconnection for, with no upstream traffic
  to justify it.
- **Hono on Node 24, TypeScript run directly**
  ([type stripping](https://nodejs.org/api/typescript.html)). The server has no
  build step, and each route reads like a plain `fetch` handler. I ruled out
  Phoenix LiveView, which would give real-time for free, because I'd be
  reviewing a language I don't write.
- **perfect-freehand** draws ink from the raw points on every client. The
  stored data is the writer's hand, and every screen draws it identically.

What it costs: one process can't scale past one machine without a new
transport, and `node:sqlite` is younger than `better-sqlite3` (a swap confined
to `server/db.ts`).

## The harness: README → CLAUDE.md → spec

The first working version landed as one vertical slice
([`65e4d11`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/65e4d11)),
with checks for the README claims written alongside the code. They run against
the running app: two people reaching for the brush at once, the same person
twice, strokes returned exactly as sent, a character reaching another session
within a second, and a server killed with SIGKILL and restarted on the same data.
To make sure the checks could fail, I disabled the pass-the-brush rule. Two
checks went red, and I restored the rule.

The checks passed, but the app was still broken. When I drove two real Chrome
sessions at 390×844 and 1920×1080, `/` came up blank. The catch-all static
handler was serving the `dist/` directory itself as an octet-stream, and the
browser downloaded it. The course's shipped check only asks for a 200, so it
passed. I didn't just fix the line: I first wrote `spec/pages.test.ts`, watched
it fail against the broken server, and then fixed it
([`0ff6c2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/0ff6c2c)).
"Failing check first" then became a rule in `CLAUDE.md`
([`7862797`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/7862797)),
along with "look at it at both viewports in a real browser before saying a UI
change works". The same screenshots showed the submit button falling off the
bottom of a phone screen while writing
([`327d528`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/327d528)).

## How I know it works, and what I don't know yet

- `pnpm check`: 20 checks green, including against a copy of the runtime image
  with production dependencies only.
- Two browser sessions side by side: one wrote a character on a phone-sized
  screen, with a resize mid-stroke, and the desktop session showed it 55 ms
  later.
- **Not verified:** the Docker build itself (no Docker on my machine, so the
  first CI run is its test), and latency over the real internet to Sydney. Both
  get checked on the first deploy, before the crit.

## Next

Crit 9 is about everyone at once: what happens when thirty people want one
room's brush (a queue? a shorter hold?), and whether watching strokes appear
live is part of good. Crit 10's logging replaces the single `console.log` per
write.
