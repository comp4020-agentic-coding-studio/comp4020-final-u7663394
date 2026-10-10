// The stroke format, shared by the writing pad and the server.
//
// A stroke is the writer's own hand, stored as drawn: a flat list of
// [x, y, pressure] triples, x and y in 0..INK_BOX on a square pad and pressure
// in 0..1. `pen` says whether the pressure is real (a stylus) or should be
// simulated from speed when the stroke is drawn (mouse, finger). The server
// checks the shape and the size of a character and otherwise never touches it.

export const INK_BOX = 1000;
export const MAX_STROKES = 64;
export const MAX_POINTS = 6000; // across all strokes of one character

export interface Stroke {
  pts: number[];
  pen: boolean;
}

// How the brush draws a character's points, each 0..1: weight (how hard it
// presses), wetness (how much ink it carries) and speed (how fast it moves).
// The writer chooses it, it is kept with the character, and every screen draws
// with it. It changes how the ink looks, never the points.
export interface BrushStyle {
  weight: number;
  wetness: number;
  speed: number;
}

export const DEFAULT_STYLE: BrushStyle = { weight: 0.55, wetness: 0.42, speed: 0.38 };

export function isBrushStyle(value: unknown): value is BrushStyle {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { weight, wetness, speed } = value as Record<string, unknown>;
  return inRange(weight, 1) && inRange(wetness, 1) && inRange(speed, 1);
}

export function isStrokeList(value: unknown): value is Stroke[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_STROKES) return false;
  let points = 0;
  for (const stroke of value) {
    if (typeof stroke !== "object" || stroke === null) return false;
    const { pts, pen } = stroke as Record<string, unknown>;
    if (typeof pen !== "boolean" || !Array.isArray(pts)) return false;
    if (pts.length === 0 || pts.length % 3 !== 0) return false;
    points += pts.length / 3;
    if (points > MAX_POINTS) return false;
    for (let i = 0; i < pts.length; i += 3) {
      const [x, y, p] = [pts[i], pts[i + 1], pts[i + 2]];
      if (!inRange(x, INK_BOX) || !inRange(y, INK_BOX) || !inRange(p, 1)) return false;
    }
  }
  return true;
}

// A draft on its way to the room (live ink): the strokes so far, which may be
// none after an undo or a clear, and the one still being drawn. Same limits as
// a finished character.
export function isDraft(strokes: unknown, current: unknown): boolean {
  if (!Array.isArray(strokes) || current === undefined) return false;
  if (current !== null && (typeof current !== "object" || Array.isArray(current))) return false;
  const all = current === null ? strokes : [...strokes, current];
  return all.length === 0 || isStrokeList(all);
}

const inRange = (n: unknown, max: number): boolean =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
