# 1. Vue 3 client, Node + Hono server, SQLite on the volume, SSE for live updates

Date: 2026-10-03

## Status

Accepted

## Context

Calligraphy Relay is a turn-based shared scroll: one person at a time holds the
brush, writes one character, and passes it on. Everyone else in the room
watches. What has to happen, in the order the README promises it:

- a written character is kept exactly as drawn, credited to its writer, and is
  still there after a restart or redeploy;
- every open session sees it within about a second, and sees who is holding
  the brush;
- the server can refuse a second writer, or the same writer twice in a row,
  even when two requests race.

The course setup fixes the rest: one `shared-cpu-1x` Fly machine with 256 MB,
one volume at `/data`, no separate database server, and a machine that stops
when idle and starts on the next request. I write Vue 3 and TypeScript already
and want to be able to read and correct everything the agent writes.

The traffic is small and asymmetric. Writes are rare (one character every
twenty seconds or so per room) and come from one person at a time; reads are a
fan-out to everyone watching. Nobody needs to send data to the server faster
than they press "done".

## Options

**Storage**

1. *SQLite on the volume, through Node's built-in `node:sqlite`.* One file on
   `/data`, transactions, real constraints (`UNIQUE (scroll_id, position)`, a
   partial unique index for "one open scroll per room"). No native build step,
   no extra package. Costs: one writer at a time (irrelevant here), and
   `node:sqlite` is newer than `better-sqlite3`.
2. *`better-sqlite3`.* The same database with a longer track record, but a
   native addon to compile or fetch in the Docker build.
3. *JSON files on the volume.* Simplest to read, but no transactions: the
   "only one person writes position 3" rule would live in application code and
   a crash mid-write could leave a half-written file.
4. *Postgres (Fly Managed or a second app).* Ruled out by the course setup, and
   far more than one scroll needs.

**Real-time transport**

1. *Server-Sent Events plus ordinary POSTs.* Writes are already
   request/response; only the fan-out needs pushing. `EventSource` reconnects
   by itself, which matters on the slow connections the marker tries.
2. *WebSockets.* Two-way, which we don't use yet; reconnection and heartbeats
   are ours to write; a second protocol to test.
3. *Polling every second.* Simple, but thirty phones in a showcase polling the
   same machine is wasteful, and "within about a second" becomes "up to a
   second plus a request".

**Server framework**

1. *Hono on `@hono/node-server`.* Small, TypeScript-first, has an SSE helper
   and static file serving, and the code reads like plain `fetch` handlers.
2. *Fastify or Express.* Mature, but larger surface for the same handful of
   routes.
3. *A full-stack framework (Nuxt, Phoenix, Django).* Phoenix LiveView would give
   real-time for free, but I'd be reading a language I don't write. Nuxt adds
   SSR and conventions the app doesn't need.

## Decision

- **Client:** Vue 3 + TypeScript, built by Vite into static files.
- **Server:** Node 24 running TypeScript directly (type stripping, no build
  step for the server) with Hono. One process serves the API, the SSE streams,
  the built client and `/readme/`.
- **Storage:** SQLite via `node:sqlite` at `/data/relay.db`, WAL mode,
  `synchronous = FULL`. Migrations are numbered SQL steps run at boot and
  tracked with `PRAGMA user_version`. They don't use Fly's `release_command`,
  because that machine has no volume.
- **Real-time:** SSE per room for glyph/brush/presence/scroll events, with a
  comment heartbeat every 15 s to keep proxies from closing idle streams. All
  writes are POSTs, and a write is answered only after it is committed.
- **Ink:** strokes are stored as raw point lists (x, y in 0--1000, pressure)
  and drawn by `perfect-freehand` on every client, so a character looks the
  same on every screen and the stored data is the writer's own hand.

## Consequences

- Every rule that matters (one brush holder, no two in a row, one character per
  position) is checked inside a SQLite transaction on the one machine. With a
  single process there is no cross-machine coordination to get wrong.
- Presence (who is connected) lives only in memory, because it *is* connection
  state. A restart drops every stream; clients reconnect and refetch.
- The app cannot scale past one machine without changing the transport, since
  SSE subscribers live in one process. That fits the course setup and the
  "one room, one table" scale the README argues for. Going further would need
  a new record.
- `node:sqlite` is marked as still in active development in Node 24. If it
  misbehaves, `better-sqlite3` has nearly the same synchronous API, so the swap
  is contained in `server/db.ts`.
- If live stroke-by-stroke watching ("see Bamboo's brush move") becomes part of
  good, POSTing batches every ~100 ms over the same SSE fan-out is the first
  thing to try before switching to WebSockets.
