# Process overview

_Current as of crit 8 (week 9). Rewritten, not appended to, at each crit._

## From the brief to an idea

The brief asks for a multi-user, real-time site that is good, and warns us not to make the most common answer: a chat room with different nouns. My first idea was a shared drawing canvas, but I realised this was just the drawing version of the same common answer. Anyone could draw anywhere, and r/place showed that at a large scale this can become a fight over space. I wanted something where the group has to work together, so I chose a relay. One line of classical Chinese poetry is written one character at a time by different people, while each person's handwriting stays visible. I wrote this idea in `IDEA.md`
([`9abbf52`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/9abbf52))
before choosing any technology. This meant I could choose the stack based on the idea instead of changing the idea to fit the stack.

## Directing the agent: the decisions I kept

I gave Claude Code the brief, the crit 8 spec and `IDEA.md`. I told it to use Vue 3 + TypeScript for the frontend because I know this stack and can read and correct the code myself. Before writing code, it asked me three product questions. I made these decisions myself because each one affects what "good" means for the app:

- **How strict is the relay?** I chose *pass the brush*: nobody can write two characters in a row, so one person cannot finish a scroll alone. A softer rule, such as unlocking the brush after one minute, would stop the app from getting stuck, but then the artwork would not really depend on the group. Allowing only one character per person would also cause a problem because a group of four could not finish a ten-character line.
- **Where do people write?** There is a shared hall at `/`, plus named rooms (`/r/table-4`), so a large showcase crowd can split into different tables instead of everyone waiting for the same brush. Rooms also allow the spec to use temporary `spec-…` rooms without changing the real scroll.
- **What is a person?** One person is one browser. A pseudonym is connected to a long-lived cookie, so the app still knows who you are when you return tomorrow. The downside is that two tabs in the same browser count as the same person. I accepted this, and the UI explains it when the same person wrote last.

The README came first ([`2d5a9fc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/2d5a9fc)). Its six claims became rules in `CLAUDE.md` and checks in `spec`.

## Why this stack

The full record is [ADR 0001](doc/adr/0001-vue-node-sqlite-sse.md)
([`20dbce0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/20dbce0)). In short, the course gives us one 256 MB machine and one volume, and this app has very different amounts of reads and writes. Writes are rare because only one person writes at a time, while every write needs to be shown to everyone watching.

- **SQLite on the volume** (through Node's built-in `node:sqlite`) rather than JSON files or Postgres. The important rules can be handled with database constraints and transactions: `PRIMARY KEY (scroll_id, position)`, a partial unique index that allows only one open scroll per room, and `BEGIN IMMEDIATE` around "take the brush". With JSON files, I would need to handle these rules in application code without the same atomicity. Postgres is outside the course setup, while SQLite's own guidance fits a small, single-writer site like this ([Appropriate Uses](https://www.sqlite.org/whentouse.html)). The database is
stored on the volume, which is the only storage that survives a redeploy ([Fly Volumes](https://docs.fly.io/volumes/overview)). Migrations run when the app starts because Fly's release machine does not have access to the volume.
- **Server-Sent Events plus POSTs** rather than WebSockets or polling. Every write already works as a normal request and response, so only updates to everyone watching need to be pushed. `EventSource` also reconnects by itself ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)), which is useful when users have slower connections. WebSockets would add a second protocol and I would need to handle reconnection myself, even though the app does not need much real-time data going back to the server.
- **Hono on Node 24, TypeScript run directly** ([type stripping](https://nodejs.org/api/typescript.html)). The server does not need a build step, and each route is easy for me to read because it looks
like a normal `fetch` handler. I also considered Phoenix LiveView, which provides many real-time features for me, but I would have to review code in a language that I do not normally use.
- **perfect-freehand** draws the ink from the raw points on every client. The stored data keeps the writer's original hand movements, and every screen uses the same data to draw the result.

The main cost is that one process cannot easily scale to multiple machines without changing the real-time transport. `node:sqlite` is also newer than `better-sqlite3`, although changing it would mostly be limited to `server/db.ts`.

## The harness: README -> CLAUDE.md -> spec

The first working version was built as one complete vertical slice ([`65e4d11`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/65e4d11)), with checks for the README claims written together with the code. These checks run against the real running app. They test two people trying to take the brush at the same time, the same person trying to write twice, strokes being returned exactly as they were sent, a character reaching another session within a second, and the server being killed with SIGKILL and restarted using the same data. To make sure the checks could really catch problems, I temporarily disabled the pass-the-brush rule. Two checks failed, and then I restored the rule.

However, the checks were all passing while the app was still broken. When I tested it using two real Chrome sessions at 390×844 and 1920×1080, `/` showed a blank page. The catch-all static handler was serving the `dist/` directory itself as an octet-stream, so the browser downloaded it instead of showing the page. The course's provided check only looks for a 200 response, so it did not find this problem. Before fixing the bug, I wrote `spec/pages.test.ts` and watched the new test fail against the broken server. Then I fixed the problem ([`0ff6c2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/0ff6c2c)). After this, "failing check first" became a rule in `CLAUDE.md` ([`7862797`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/7862797)). I also added a rule to test UI changes at both screen sizes in a real browser before saying they work. The same screenshots helped me find another problem: the submit button went off the bottom of the phone screen while the user was writing ([`327d528`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/327d528)).

## How I know it works, and what I don't know yet

- `pnpm check`: 20 checks are green, including tests against a copy of the runtime image with production dependencies only.
- I tested two browser sessions side by side. One wrote a character on a phone-sized screen, including resizing the screen during a stroke, and the desktop session showed the new character 55 ms later.

## Next

Crit 9 will focus on what happens when everyone uses the app at the same time. For example, I need to decide what should happen when thirty people want the brush in the same room: should there be a queue, or should each person have a shorter time to hold it? I also need to decide whether seeing strokes appear live while someone is writing should be part of what makes the app good. For Crit 10, I will improve the logging system beyond the current single `console.log` for each write.
