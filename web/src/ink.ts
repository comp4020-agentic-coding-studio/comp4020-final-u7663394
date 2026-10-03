// Turning stored points into ink. Every screen draws a character from the same
// points with the same settings, so it looks the same everywhere, and the
// points themselves are never changed.
import { getStroke } from "perfect-freehand";
import type { Stroke } from "../../shared/strokes.ts";

const BRUSH = {
  size: 58,
  thinning: 0.62,
  smoothing: 0.55,
  streamline: 0.35,
  start: { taper: 0, cap: true },
  end: { taper: 30, cap: true },
};

export function strokePath(stroke: Stroke, last = true): string {
  const points: [number, number, number][] = [];
  for (let i = 0; i < stroke.pts.length; i += 3) {
    points.push([stroke.pts[i], stroke.pts[i + 1], stroke.pts[i + 2]]);
  }
  return outlineToPath(getStroke(points, { ...BRUSH, simulatePressure: !stroke.pen, last }));
}

// From the perfect-freehand README: a closed path through the outline's midpoints.
function outlineToPath(outline: number[][]): string {
  if (outline.length < 4) return "";
  const avg = (a: number, b: number): string => ((a + b) / 2).toFixed(1);
  const [a, b, c] = outline;
  let d = `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${b[0].toFixed(1)},${b[1].toFixed(1)} ${avg(b[0], c[0])},${avg(b[1], c[1])} T`;
  for (let i = 2; i < outline.length - 1; i++) {
    d += `${avg(outline[i][0], outline[i + 1][0])},${avg(outline[i][1], outline[i + 1][1])} `;
  }
  return `${d}Z`;
}
