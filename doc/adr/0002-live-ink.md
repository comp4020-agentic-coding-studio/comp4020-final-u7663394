# 2. Live ink: the room watches the brush move, but only the added character is kept

Date: 2026-10-08

## Status

Accepted

## Context

Crit 9 asks for one decision about how the app behaves when several people use
it at once. For this app the question that matters most is what the people who
are *not* holding the brush get to see.

In the crit 8 version, a watcher saw "Bamboo is writing 群" and an empty square
for up to three minutes. Then the finished character appeared all at once. So
when a group sat side by side, the most interesting part (someone's hand slowly
making the character) only happened on one screen. README claim 4 says "the
room sees it happen", but the room really only saw the result. ADR 0001 already
pointed to this: "If live stroke-by-stroke watching becomes part of good,
POSTing batches every ~100 ms over the same SSE fan-out is the first thing to
try."

There is a real tension, though. The README says handwriting is never judged
and an "ugly" character still belongs to somebody. If the room can watch you
draft, it also sees your false starts, your undos and the moment you clear the
pad. That could make people more nervous about writing at all.

## Options

1. *Finished characters only* (what crit 8 shipped). Cheapest, and the writer
   gets privacy while drafting. But watchers just look at an empty square, and
   the co-presence the brief asks for is mostly a name and a countdown.
2. *Each stroke when the pen lifts.* Less traffic and it feels a bit less
   watched. But strokes pop in whole, so the movement of the brush, which is
   what calligraphy is about, is lost.
3. *Continuous live ink, relayed and never stored* (chosen). Watchers see the
   stroke being drawn about eight times a second, and undo and clear show up as
   strokes disappearing. When the character is added it replaces the draft.
4. *Continuous live ink, stored as a replay.* Keep the timing and the undos so
   anyone can replay how each character was written later. This makes a richer
   archive, but the scroll would then keep false starts that the writer took
   back. I think what is kept should be what the writer chose to add.
5. *Let the writer hide their brush* (an opt-out). This gives privacy back, but
   it adds a setting and splits the room into people you can watch and people
   you can't. The README is about one shared scroll, so I left it out for now.

For the transport, the choice was between sending the draft as small HTTP
requests over the SSE stream we already have, or adding a WebSocket. Only one
person per room is ever drawing, at about eight updates a second, so HTTP is
enough. A WebSocket would be a second protocol to test, with reconnection to
write by hand.

## Decision

- `PUT /api/rooms/:room/ink` takes the whole draft every time: the strokes so
  far plus the one still being drawn. It doesn't send only the changes, so a
  lost or late update fixes itself with the next one. The server checks the
  shape (same limits as a character) and that the sender holds the brush for
  that position, then broadcasts an `ink` event. Nothing is written to the
  database and nothing is kept in memory.
- The writer's page sends at most one request at a time, and at most one every
  120 ms, always the latest draft (`web/src/liveInk.ts`). One at a time also
  keeps drafts in order.
- Watchers draw the draft in lighter "wet" ink over the model character in the
  cell being written. When the character is added it "dries" into normal ink.
- Undo and clear are shown, because the draft is shown exactly as it is (claim
  2 is "kept as drawn", not "kept as the writer would like it to look"). The pad
  tells the writer: "The room watches your brush as you write. Only what you add
  to the scroll is kept."
- Since the server keeps no drafts, the writer's page sends its draft again
  when its own stream reconnects and when the number of people in the room
  changes. This way someone who just arrived sees the draft straight away.
- Screen readers hear when someone picks up the brush and when a character is
  added, but not every stroke, which would be too noisy.

## Consequences

- The writer is watched. False starts are seen live, even though they are never
  kept. This is the cost to "never judge handwriting" that I accepted, and the
  pad says so up front. At the crit I will watch whether people hesitate or undo
  more when others can see. If they freeze, option 2 or option 5 is the
  fallback.
- Traffic grows with every stroke and every watcher, because the whole draft
  is sent each time. One character is capped at 6000 points (about 70--80 KB of
  JSON), but a normal one is far smaller. That is fine for a table of people.
  If a big room in the showcase gets slow, sending only the stroke being drawn
  plus a count is the first thing to change.
- Late joiners depend on the writer's browser to resend. Presence counts people,
  not tabs, so a second tab from someone who is already in the room only sees
  the draft from the writer's next change.
- Live ink is the only broadcast without a commit behind it. The server checks
  it synchronously against the brush holder, so a draft that arrives after its
  character was added is refused instead of being shown late.
- The only in-memory state is still who is connected (`server/hub.ts`).
