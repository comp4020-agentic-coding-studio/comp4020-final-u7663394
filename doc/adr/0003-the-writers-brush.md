# 3. The writer's brush: real ink from the same points, set by the writer and kept with each character

Date: 2026-10-10

## Status

Accepted. Replaces the "Ink" line of ADR 0001 (strokes drawn by
`perfect-freehand`); everything else in 0001 stands.

## Context

The README says handwriting shows the person behind it, but the ink didn't
look like a brush. `perfect-freehand` draws every stroke as one flat black
shape with rounded ends, so a scroll looked like it was written with a marker
and didn't feel like real calligraphy. The question I judge by hand, whether
different hands still look like one scroll, is hard to judge when no hand
looks like calligraphy.

I studied 墨 Ink (ink-inky.vercel.app), a calligraphy brush engine. Its ink
gets thinner where the hand moves fast, runs out as the brush travels and
breaks into dry streaks (飞白), bleeds when wet and pools where the brush
stops. It has three dials, weight, wetness and speed, that change how a
character is drawn after it is written. But it also does things this app
must never do: it can redraw a character from a dataset of model strokes,
reshape strokes towards a neat "formality", and match what you wrote against
a model character.

So there are two decisions: how the ink is drawn, and who sets the brush and
where that choice lives.

## Options

**Drawing**

1. *Tune `perfect-freehand`* (taper, thinning). Cheap, but it is still one
   flat silhouette per stroke: no dry brush, no ink running out.
2. *Use 墨 Ink's whole approach*, dataset strokes and matching included. The
   characters would look the best, but they would be the dataset's hand, and
   matching is judging.
3. *Only its brush, on our own points* (chosen). A canvas renderer in
   `web/src/ink.ts` that draws the stored points with the same ideas, and
   nothing that reads the points as a known character.
4. *A bristle or WebGL simulation.* More realistic, much more code, and harder
   to make look the same on every screen.

**Who sets the brush**

1. *The writer, per character, kept with it* (chosen).
2. *Each viewer, for their own screen.* The scroll would look different to
   everyone, and the brush would stop being part of the writer's character.
3. *One brush per scroll, set by whoever writes first.* A tidier scroll, but
   it takes the choice away from everyone after them, and whether mixed hands
   read as one piece is meant to be judged, not forced.
4. *Per person, saved on the server and applied to all their characters.*
   Changing it would restyle characters already on the scroll, which is
   almost re-signing them.
5. *Save a rendered image.* Exact pixels forever, but heavy, blurry at other
   sizes, and no longer the points of the hand.

## Decision

- Every character has a `style`: `weight`, `wetness` and `speed`, each from 0
  to 1. The writer sets it on the pad before adding, with five presets (楷 even,
  浓 rich, 淡 light, 干 dry, 润 wet) and three sliders, and the pad redraws as
  they move. Once added it is fixed, like the strokes and the name.
- It is stored in three `REAL` columns with `CHECK (… BETWEEN 0 AND 1)`
  (migration 2). A character added without one gets the default brush (0.55,
  0.42, 0.38); characters from before the migration got the same. A value
  that is out of range or not a number is refused with `invalid_style`, never
  clamped.
- Live ink carries the writer's current style too, so the room sees slider
  changes as they happen, the same way it sees strokes.
- `web/src/ink.ts` draws from the points and the style only. The hand's speed
  is read from the spacing of its points (pointer events arrive at a steady
  rate) and sets the width; pen pressure is used when there is a pen. All the
  randomness (edge noise, streaks, grain) is seeded from each stroke's index
  and first point, never `Math.random()`, and sizes are in box units, so a
  bigger screen only means more pixels.
- Each browser remembers its last brush in localStorage as the starting point
  for the next character. That is a convenience, not an account.

## Consequences

- The points are still stored and drawn byte for byte the same, but drawing
  now means a spline through them, a slight wobble and texture. I rewrote the
  `CLAUDE.md` rule so it is clear: drawing may interpolate between the points,
  storing and sending may not touch them.
- Characters written before this change now look different. Their points and
  names are what the README promised to keep, and there was no brush to choose
  then, so I accepted this.
- "The same on every screen" means the same shapes, streaks and grain at any
  size, not identical pixels: two browsers antialias a little differently.
  In one Chrome, two viewers at the same size got identical pixels.
- Canvas is heavier than SVG. Moving a slider redraws the whole character; on
  desktop Chrome that fits in a frame, a slow phone may lag while dragging.
- Speed is read from point spacing, not time, because the stroke format has no
  timestamps. Adding them would capture the hand's rhythm better, but it
  changes the stored format, so it is left for later.
- A very wet or heavy brush can make a character harder to read. That is the
  writer's choice, and the app says nothing about it.
- The pad tells the writer that the brush "redraws your strokes, never moves
  them", because the dials could look like a way of tidying up handwriting.
