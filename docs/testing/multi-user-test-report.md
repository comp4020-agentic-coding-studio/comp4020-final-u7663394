# Multi-user test report

- **Date:** 19 October 2026 (all times are UTC)
- **App:** https://comp4020-final-u7663394.fly.dev
- **Version tested:** `1da28b9`, deployed by CI after a push to `main`
- **How:** `scripts/multi-user-test.ts` opens each person in their own Chrome
  browser context (no shared cookies, like two Chrome profiles). One is
  desktop size (1920×1080) and one is phone size (390×844). Every test uses a
  new `mutest-…` room, so the hall is never touched. The script prints the time
  of each step, and the server side comes from
  `mise exec -- flyctl logs -a comp4020-final-u7663394 --no-tail`.

## 1. Logs

Every line is `[request tag] event key=value …`, with `user=` (short id) and
`as=` (seal name). The log already covered joins, leaves, actions and
refusals. Two items from the list were missing, so they were added in
`643760e`:

| What should be logged | Log line |
| --- | --- |
| user connects / joins room | `visitor.join` (new name), `room.open … present=2` |
| user disconnects / leaves room | `room.close … present=1 after=10s` |
| server receives an action | `brush.take`, `glyph.add`, `cloth.write`, … and `POST … 200 4ms` |
| server broadcasts an update | `broadcast room=… event=glyph streams=2 present=2` **(new)** |
| server rejects an action | `POST … 409 … error=brush_taken` |
| server sends one user a state snapshot | `room.snapshot … glyphs=1 brush=0669eecf present=3 user=…` **(new)** |

Never logged: the cookie, stroke points, and live ink (a draft is kept
nowhere, and that includes the log). `spec/log.test.ts` checks the new lines.

## 2–4. Deploy, read the logs, users join

The first push failed CI. An old browser test sometimes matched two "Write"
headings, which had nothing to do with the logging change. After the fix in
`1da28b9`, CI passed and deployed, and the new lines showed up in
`flyctl logs` straight away. `--no-tail` only returns the last 100 lines, so
the logs were pulled right after each run.

## 5. Scenarios

| | Scenario | Result |
| --- | --- | --- |
| a | Two users join | Pass |
| b | One user's action reaches the others | Pass |
| c | Actions in the same second | Pass |
| d | Late user joins | Pass |
| e | Leave and return (tab close) | Pass |
| f | Isolated rooms | Pass |
| g | Two machines | Breaks, as expected |
| h | Restart mid-session | Pass, with two notes |

### a) Two users join

**Expected:** Ada (desktop) and Bo (phone) open `/r/mutest-216f85`, pick
names, and both pages say "2 people here".

**Observed:** Both pages showed 2 people. A page first opens the stream with
no name (`user=-`) and reopens it once the person joins, so the log knows who
is watching:

```
05:18:50 [3f0741] visitor.join user=1036fa28 as=Ada
05:18:50 [40856b] room.close room=mutest-216f85 user=- present=0 after=0s
05:18:50 [9207c1] room.open room=mutest-216f85 user=1036fa28 as=Ada present=1
05:18:50 [e22e66] room.open room=mutest-216f85 user=79aac6e3 as=Bo present=2
```

### b) One user's action reaches the others

**Expected:** Ada picks up the brush. Bo is told "Ada is writing", sees her
strokes live, and sees the added character with her seal within a second.

**Observed:** All three reached Bo's phone without a reload, and the screen
reader region said "Ada wrote 群". The log shows the action, then the
broadcast to both streams, then the reply. Live strokes have no line, on
purpose.

```
05:18:51 [08c0b5] glyph.add room=mutest-216f85 scroll=137 position=0 char=群 strokes=1 points=11 brush=0.55/0.42/0.38 user=1036fa28 as=Ada
05:18:51 [08c0b5] broadcast room=mutest-216f85 event=glyph streams=2 present=2
05:18:51 [08c0b5] POST /api/rooms/mutest-216f85/glyphs 201 4ms user=1036fa28 as=Ada
```

### c) Actions in the same second

**Expected:** Cy joins. Bo and Cy press "Pick up the brush" at the same
moment. Only one gets it, and the other is refused with a reason. Ada wrote
last, so when Ada tries too, the server refuses (nobody writes two in a row).

**Observed:** The two requests left the browsers 1 ms apart (Cy at
05:18:51.658, Bo at 05:18:51.659). Cy got the brush. Bo got `brush_taken`,
Bo's page said "Someone else is holding the brush." and then "Cy is writing".
Ada got `pass_the_brush`. Bo's page then asked for a fresh snapshot:

```
05:18:51 [98231c] POST /api/rooms/mutest-216f85/brush 409 2ms user=1036fa28 as=Ada error=pass_the_brush
05:18:51 [97f8c9] brush.take room=mutest-216f85 scroll=137 position=1 char=贤 user=0669eecf as=Cy
05:18:51 [97f8c9] broadcast room=mutest-216f85 event=brush streams=3 present=3
05:18:51 [036393] POST /api/rooms/mutest-216f85/brush 409 1ms user=79aac6e3 as=Bo error=brush_taken
05:18:51 [08d902] room.snapshot room=mutest-216f85 scroll=137 glyphs=1 brush=0669eecf present=3 user=79aac6e3 as=Bo
```

### d) Late user joins

**Expected:** Dee opens the room while Cy is halfway through a character, with
no name yet. Dee should see Ada's character, "Cy is writing", Cy's live
strokes, and the name form.

**Observed:** All four were on Dee's screen. Dee's snapshot already had the
first character and Cy's brush. The draft isn't stored anywhere, so Cy's page
sent it again when the number of people in the room changed.

```
05:18:53 [a2b9fc] room.snapshot room=mutest-216f85 scroll=137 glyphs=1 brush=0669eecf present=3 user=-
05:18:54 [a95f6b] visitor.join user=fe1c5724 as=Dee
05:18:54 [d05b57] room.open room=mutest-216f85 user=fe1c5724 as=Dee present=4
```

### e) Leave and return (tab close)

**Expected:** Cy closes the tab halfway through a character. The others see
the count drop, but the brush stays with Cy (it is held for 3 minutes). When
Cy comes back, the cookie makes Cy the same person, the pad comes back with
the half-written strokes (saved in localStorage), and Cy can finish.

**Observed:** Exactly that. Cy came back after 4 seconds and added the
character:

```
05:18:54 [f6536f] room.close room=mutest-216f85 user=0669eecf as=Cy present=3 after=2s
05:18:58 [fb7074] room.snapshot room=mutest-216f85 scroll=137 glyphs=1 brush=0669eecf present=3 user=0669eecf as=Cy
05:18:58 [63b235] room.open room=mutest-216f85 user=0669eecf as=Cy present=4
05:18:58 [991f30] glyph.add room=mutest-216f85 scroll=137 position=1 char=贤 strokes=1 points=11 brush=0.55/0.42/0.38 user=0669eecf as=Cy
```

### f) Isolated rooms

**Expected:** Eve opens another room, `mutest-216f85-b`. Eve and Ada each add
a character at the same time, in their own rooms. Nothing should cross over.

**Observed:** Eve's page said "1 person here", and Ada's still said 4. Each
broadcast only went to its own room's streams (4 and 1). Eve's name never
showed up in the first room, and Eve's scroll held only Eve's character.

```
05:18:59 [851a22] broadcast room=mutest-216f85 event=glyph streams=4 present=4
05:18:59 [a78ece] broadcast room=mutest-216f85-b event=glyph streams=1 present=1
```

### g) Two machines (`fly scale count 2`)

**Expected:** The app is built for one machine (ADR 0001). Each machine has
its own SQLite file on its own volume, and who is connected is only kept in
memory. So two users on different machines shouldn't see each other at all.
This test checks how it breaks.

**How:** `fly scale count 2` added machine `890de5c6d94638` with a new, empty
volume. The `fly-force-instance-id` header pinned Ada to the old machine and
Bo to the new one.

**Observed:** It became two separate apps behind one URL:

- Both pages said "1 person here".
- Ada and Bo **both** got the brush for the same character, and both added
  it, so the one-brush rule broke.
- Neither saw the other's character.
- Ada's cookie meant nothing on the new machine (`me=null`), because Ada only
  exists in the first database.

The `app[…]` part of each Fly log line shows the machine:

```
05:19:59 app[890de5c6d94638] db: migrated to version 4     <- new machine, empty database
05:20:03 app[d891157a925d78] [6b70e1] brush.take room=mutest-954b71 scroll=139 position=0 char=群 user=542c2eae as=Ada
05:20:03 app[890de5c6d94638] [73003d] brush.take room=mutest-954b71 scroll=1 position=0 char=群 user=9a39f8c5 as=Bo
```

Ten requests with no pinning all went to the old machine, so at first a normal
user probably wouldn't notice. But anyone the proxy sends to the second
machine ends up in a different, empty app.

**After:** The second machine and its volume were destroyed. The app is back
to one machine and one volume.

### h) Restart the machine mid-session

**Expected:** Ada has written one character, and Bo holds the brush halfway
through the next one. `fly machine restart d891157a925d78` drops every
connection. Both pages should show "reconnecting…" and then "live" again.
Nothing should be lost: Ada's character and Bo's brush are in the database,
and Bo's draft is in Bo's localStorage.

**Observed:** Both pages showed "reconnecting…" within 0.2 s. After the
restart, Ada's character was still there, Bo still held the brush with the
strokes on the pad, Ada saw Bo's draft again, and Bo finished the character.
(Lines 2–4 below are shortened.)

```
05:21:05 [8d000d] brush.take room=mutest-3bbfa0 scroll=140 position=1 char=贤 user=86c6e8fd as=Bo
05:21:06 SIGINT: closing
05:21:09 proxy: instance refused connection (x2)
05:21:10 listening on http://0.0.0.0:8080 (data in /data)
05:21:19 [e9a4f2] room.snapshot room=mutest-3bbfa0 scroll=140 glyphs=1 brush=86c6e8fd present=1 user=231f36ba as=Ada
05:21:21 [cf3d34] glyph.add room=mutest-3bbfa0 scroll=140 position=1 char=贤 strokes=1 points=11 brush=0.55/0.42/0.38 user=86c6e8fd as=Bo
```

Two things showed up:

1. **No `room.close` lines at the restart.** The process exits on SIGINT
   before the streams close, so the log only says `SIGINT: closing`. You can
   only work out who was cut off from the `room.open` lines before it.
2. **Reconnecting was slow.** The server was ready 4 s after the restart, but
   the pages took 14–16 s to say "live" again. The browser's retry delays and
   the proxy errors while Node was starting probably add up, but this wasn't
   looked into.

## What to do next

- Keep the app on one machine. Two machines would need the brush rule and
  live updates to work across machines, which means a new ADR.
- Log a `room.close` for every open stream when the server shuts down, so a
  restart shows who was dropped.
- Find out why reconnecting takes about 10 s longer than the restart itself.

The `mutest-…` rooms stay in the database, because a written character can
never be deleted (on purpose). They are separate rooms, so the hall isn't
affected.
