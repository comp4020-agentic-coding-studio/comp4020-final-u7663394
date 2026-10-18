# 6. The water cloth: everyone writes at once while they wait, and it dries

Date: 2026-10-18

## Status

Accepted. Adds a second surface to every room; nothing in ADRs 0001--0005 is
replaced. Changes the README's "no free canvas" exclusion into "no canvas that
keeps".

## Context

The relay makes people wait. Only one person holds the brush, a character
takes a minute or two, and in a showcase room of eight that is a long time
with nothing to do but watch. Live ink (ADR 0002) made watching better, but
watching is still all a waiting person can do, and someone who has just
written can't write again until another person has.

The obvious answer is a shared canvas everyone can draw on at once. The README
rules that out on purpose: an open canvas turns into a fight for space, as
r/place showed, and anything that keeps free drawing needs moderating.

Calligraphy already has an answer. In Chinese parks people write poems on the
pavement with water and a big sponge brush (地书, *dishu*, "ground writing").
A crowd gathers, beginners write beside old hands, and the characters
evaporate within minutes. Vermeeren (2022), who wrote with them in Beijing,
found the writers rejected using the vanishing water for anything
mischievous, and describes it as practice "just for fun", "freed from the
burden of fixation, preservation". The same idea is sold for home practice as
a water-writing cloth (水写布): it goes dark where the brush touches and fades
as it dries.

## Options

1. *Nothing to do while waiting* (as before). Keeps the app small, but the
   wait is the weakest part of a crowded room.
2. *A shared canvas that keeps everything* (r/place). What the README argues
   against: space to fight over, things to moderate, and a second,
   permanent artwork that competes with the scroll.
3. *A private practice pad.* Calm, but alone: it doesn't bring the room
   together, which is the point of the app.
4. *A shared water cloth per room* (chosen). Everyone with a name writes on it
   at once. Each stroke is signed while it is wet and dries away within about
   a minute and a half. Nothing on it lasts, so there's nothing to fight over,
   and the scroll stays the only thing the room keeps.

**Where it lives.** On its own page, `/cloth` for the hall and
`/r/<room>/cloth` for a room, linked from the site navigation and from the
"wait for your turn" panel. Putting it on the room page would crowd the pad on
a phone. The cloth page shows who holds the brush, watches their live ink in a
small square, and says when the brush is free, so waiting there never means
missing your turn.

**What's on it.** One square per character of the room's line, so people
practise the very characters the scroll is waiting for, with the faint model
behind them. The next character to be written is picked first.

**How a stroke travels.** Sent when the pen lifts, not point by point. Several
people draw at once here, so streaming every pen-down would multiply the
traffic of ADR 0002 by the number of people; a stroke a second per person is
small.

**Where it is kept until it dries.** In SQLite, like everything else, not in
memory (the hub stays connection state only). That way a reload or a restart
doesn't wipe a stroke early, and the database, not the code, refuses to
change one.

## Decision

- `POST /api/rooms/:room/cloth` takes one stroke, a cell (which character's
  square) and the writer's brush. It needs a name, like the brush does. The
  stroke and brush are checked like a character's and stored exactly as sent;
  nothing is clamped or tidied.
- The server sets when it dries: 30 s plus up to 60 s more for a wetter brush.
  `dries_at` is in the row; reads never return a dry stroke, and a sweep
  deletes dry rows.
- `GET /api/rooms/:room/cloth` returns what is still wet. New strokes go to
  the room's existing stream as `cloth` events, so the cloth page uses the one
  stream it already opens for the room.
- Only you dry your own strokes early (`DELETE /api/rooms/:room/cloth`, "dry
  my strokes"). Nobody can wipe, move or restyle anyone else's. The database
  refuses `UPDATE` on cloth strokes.
- Limits, so one person can't flood it: 30 wet strokes each, 150 per room,
  1000 points a stroke. Over that is refused with `cloth_full` until something
  dries.
- Every screen draws a cloth stroke with `web/src/ink.ts`, from its points and
  brush, and fades it on the server's clock. No points are ever logged: the log
  says who wrote on which square, with how many points, and when it dries.
- No text, no scores, no likes on the cloth. Only strokes, each with its
  writer's name.

## Consequences

- The README's exclusion changes from "no free canvas" to "no canvas that
  keeps": the argument is about what lasts, and the cloth keeps nothing.
- A stroke is free drawing, so someone could draw something rude. It is gone
  in a minute and a half, it carries their name, and it is never kept. I
  accept that rather than build moderation.
- Strokes are in the database for up to 90 seconds, and their writer and
  square are in the log for as long as Fly keeps it. The cloth's "kept
  nowhere" is "kept until it dries", which is weaker than live ink's.
- Each wet stroke is its own small canvas. With 150 wet strokes and two
  views of each, a phone holds a few tens of megabytes of canvas at most; if
  it struggles, painting one canvas per square is the next step.
- Strokes appear when the pen lifts, so the cloth is a little less live than
  the scroll's live ink. Streaming the stroke being drawn is the first change
  to make if people miss it.
- The log grows by one line per stroke on the cloth (plus its request line).
  At a crit that is the busiest part of the log; it can be dropped to a
  per-minute count if it drowns the relay.
