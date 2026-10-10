// Turning stored points into ink. Every screen draws a character from the same
// points with the brush its writer chose, and all the randomness is seeded from
// the strokes themselves, so it looks the same everywhere. The points are never
// changed: everything here happens on the way to the canvas.
//
// The brush follows the one in 墨 Ink (ink-inky.vercel.app), redone for points
// in the 0..INK_BOX square: how fast the hand moved along a stroke sets its
// width, the brush runs out of ink as it travels and breaks into bristle
// streaks (飞白), wet ink bleeds, and ink pools where the hand paused. Weight,
// wetness and speed are the writer's three dials.
import { INK_BOX, type BrushStyle, type Stroke } from "../../shared/strokes.ts";

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (t: number): number => t * t * (3 - 2 * t);

// The reference brush is tuned in pixels of a 460 px square; this is one of
// those pixels in box units, so its proportions carry over.
const PX = INK_BOX / 460;
// half the width of a stroke at full pressure, before weight: fuller than the
// reference, since a character here fills the pad as it would a practice sheet
const HALF_WIDTH = 0.05 * INK_BOX;
// how far one load of ink goes
const INK_REACH = 5.5 * INK_BOX;
// how far apart the hand's points are taken before the spline goes through them
const SPACING = INK_BOX / 80;

// ---- seeded randomness --------------------------------------------------

function hash(...parts: (string | number)[]): number {
  const s = parts.join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// mulberry32
function random(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth noise along a stroke, so edges and dryness wander rather than flicker.
function noise(seed: number): (x: number) => number {
  const table = Float32Array.from({ length: 256 }, random(seed));
  return (x) => {
    const w = ((x % 256) + 256) % 256;
    const i = Math.floor(w);
    return mix(table[i], table[(i + 1) % 256], ease(w - i));
  };
}

// ---- reading the hand ---------------------------------------------------

interface Point {
  x: number;
  y: number;
  // pressure: from the pen, or from how slowly the hand moved
  p: number;
  // how quick the hand was here, relative to the rest of the stroke
  v: number;
}

interface Gesture {
  pts: Point[];
  // pressed down and lifted square, or touched in and flicked off; "open"
  // while the pen is still down
  entry: "pressed" | "tapered";
  exit: "blunt" | "tapered" | "open";
  // where the hand paused and ink pooled, as a fraction of the way along
  pools: { t: number; k: number }[];
}

function gesture(stroke: Stroke, last: boolean): Gesture {
  const raw: { x: number; y: number; f: number }[] = [];
  for (let i = 0; i < stroke.pts.length; i += 3) {
    raw.push({ x: stroke.pts[i], y: stroke.pts[i + 1], f: stroke.pts[i + 2] });
  }
  const reach = Math.max(...raw.map((pt) => Math.hypot(pt.x - raw[0].x, pt.y - raw[0].y)));
  if (reach < 0.012 * INK_BOX) {
    // a tap is a dot: the brush pressed down and drawn a little to the right
    const { x, y, f } = raw[0];
    const p = stroke.pen ? clamp(f, 0.1, 1) : 1;
    const pts = [[-2, -3], [1, 1], [3, 5]].map(([dx, dy]) => ({ x: x + dx * PX, y: y + dy * PX, p, v: 0.45 }));
    return { pts, entry: "pressed", exit: last ? "blunt" : "open", pools: [] };
  }

  // Pointer events come at a steady rate, so the distance between two of them
  // is how fast the hand was going.
  const n = raw.length;
  const gap = raw.map((pt, i) => (i ? Math.hypot(pt.x - raw[i - 1].x, pt.y - raw[i - 1].y) : 0));
  const along = gap.reduce<number[]>((acc, d, i) => (acc.push(i ? acc[i - 1] + d : 0), acc), []);
  const pace = raw.map((_, i) => {
    let sum = 0;
    let k = 0;
    for (let j = Math.max(1, i - 2); j <= Math.min(n - 1, i + 2); j++, k++) sum += gap[j];
    return k ? sum / k : 0;
  });

  const length = along[n - 1];
  const count = Math.max(6, Math.round(length / SPACING));
  const even: { x: number; y: number; f: number; v: number }[] = [];
  for (let k = 0, j = 0; k <= count; k++) {
    const s = (length * k) / count;
    while (j < n - 2 && along[j + 1] < s) j++;
    const u = clamp((s - along[j]) / Math.max(1e-6, along[j + 1] - along[j]), 0, 1);
    even.push({
      x: mix(raw[j].x, raw[j + 1].x, u),
      y: mix(raw[j].y, raw[j + 1].y, u),
      f: mix(raw[j].f, raw[j + 1].f, u),
      v: mix(pace[j], pace[j + 1], u),
    });
  }

  const sorted = even.map((pt) => pt.v).sort((a, b) => a - b);
  const brisk = Math.max(1e-3, sorted[Math.floor(0.75 * (sorted.length - 1))]);
  const mean = Math.max(1e-3, sorted.reduce((a, b) => a + b, 0) / sorted.length);
  // Slower is heavier, but only within what a brush does: a hand starting
  // from rest presses the tip down, it doesn't drop a blot.
  const pts = even.map((pt) => {
    const quick = clamp(pt.v / brisk, 0, 1.4) / 1.4;
    const p = stroke.pen ? clamp(pt.f, 0.1, 1) : clamp(1 - 0.55 * quick, 0.35, 1);
    return { x: pt.x, y: pt.y, p, v: 0.45 + 0.9 * quick };
  });
  // and a brush can't jump from full to thin
  const SOFTEN = [1, 2, 3, 4, 3, 2, 1];
  const p = pts.map((_, i) =>
    SOFTEN.reduce((sum, w, k) => sum + w * pts[clamp(i + k - 3, 0, pts.length - 1)].p, 0) / 16,
  );
  pts.forEach((pt, i) => (pt.p = p[i]));

  const ends = Math.min(4, even.length);
  const paceOf = (list: { v: number }[]): number => list.reduce((a, pt) => a + pt.v, 0) / list.length;
  const pools: Gesture["pools"] = [];
  for (let i = 3; i < even.length - 3; i++) {
    const t = i / (even.length - 1);
    const still = even[i].v < 0.4 * mean && even[i].v <= even[i - 1].v && even[i].v <= even[i + 1].v;
    if (still && (!pools.length || t - pools[pools.length - 1].t > 0.12)) pools.push({ t, k: 0.35 });
  }
  return {
    pts,
    entry: paceOf(even.slice(0, ends)) < 0.55 * mean ? "pressed" : "tapered",
    exit: !last ? "open" : paceOf(even.slice(-ends)) > 0.85 * mean ? "tapered" : "blunt",
    pools,
  };
}

// ---- one stroke of the brush --------------------------------------------

interface Sample {
  x: number;
  y: number;
  s: number;
  t: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  hw: number;
  v: number;
  vn: number;
  p: number;
  ink: number;
  dry: number;
  tone: number;
}

function taper(t: number, entry: Gesture["entry"], exit: Gesture["exit"], speed: number): number {
  let k = 1;
  if (entry === "tapered") {
    if (t < 0.13) k *= Math.max(0.03, Math.pow(ease(t / 0.13), 0.8));
  } else if (t < 0.15) {
    k *= 1 + 0.11 * ease(1 - t / 0.15);
  }
  if (exit === "tapered") {
    const tail = 0.2 + 0.18 * speed;
    if (t > 1 - tail) k *= Math.max(0.015, Math.pow(1 - clamp((t - (1 - tail)) / tail, 0, 1), 1.5 + 1.3 * speed));
  } else if (exit === "blunt" && t > 0.9) {
    k *= 1 + 0.09 * ease((t - 0.9) / 0.1);
  }
  return k;
}

const grey = (tone: number, alpha = 1): string => {
  const g = Math.round(255 * tone);
  return alpha === 1 ? `rgb(${g + 5},${g + 2},${g})` : `rgba(${g + 5},${g + 2},${g},${alpha})`;
};

let grainTile: HTMLCanvasElement | null = null;
function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  grainTile = document.createElement("canvas");
  grainTile.width = grainTile.height = 160;
  const ctx = grainTile.getContext("2d")!;
  const rand = random(hash("grain"));
  ctx.fillStyle = "#000";
  for (let i = 0; i < 2600; i++) {
    const [x, y, size] = [160 * rand(), 160 * rand(), 0.4 + 1.7 * rand()];
    ctx.globalAlpha = 0.25 + 0.75 * rand();
    ctx.fillRect(x, y, size, size * (0.5 + rand()));
  }
  return grainTile;
}

// Draws one stroke onto a clear canvas whose transform is in box units, and
// returns how much ink is left on the brush. `unit` is one device pixel in box
// units, which only decides how finely the stroke is sampled.
function paintStroke(
  ctx: CanvasRenderingContext2D,
  g: Gesture,
  style: BrushStyle,
  seed: string,
  load: number,
  unit: number,
): number {
  const { weight, wetness: wet, speed } = style;
  const rand = random(hash(seed, "stroke"));
  const [edgeL, edgeR, toneAt, dryAt, wobble] = ["edge-l", "edge-r", "tone", "dry", "wobble"].map((k) =>
    noise(hash(seed, k)),
  );

  // a Catmull-Rom spline through the points
  const dense: Point[] = [];
  const pts = g.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b, c, d] = [pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)]];
    for (let k = 0; k < 6; k++) {
      const [t, t2, t3] = [k / 6, (k / 6) ** 2, (k / 6) ** 3];
      const at = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push({ x: at(a.x, b.x, c.x, d.x), y: at(a.y, b.y, c.y, d.y), p: mix(b.p, c.p, t), v: mix(b.v, c.v, t) });
    }
  }
  dense.push({ ...pts[pts.length - 1] });
  const along = [0];
  for (let i = 1; i < dense.length; i++) {
    along.push(along[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y));
  }
  const length = along[along.length - 1];
  if (length < 1) return load;

  // evenly spaced samples along it, about a device pixel apart
  const count = Math.max(16, Math.round(length / Math.max(1.5 * PX, 1.2 * unit)));
  const S: Sample[] = [];
  for (let k = 0, j = 0; k <= count; k++) {
    const s = (length * k) / count;
    while (j < dense.length - 2 && along[j + 1] < s) j++;
    const u = clamp((s - along[j]) / Math.max(1e-6, along[j + 1] - along[j]), 0, 1);
    const [a, b] = [dense[j], dense[j + 1]];
    S.push({
      x: mix(a.x, b.x, u),
      y: mix(a.y, b.y, u),
      s,
      t: s / length,
      p: mix(a.p, b.p, u),
      v: mix(a.v, b.v, u) * (0.3 + 1.4 * speed),
      tx: 0, ty: 0, nx: 0, ny: 0, hw: 0, vn: 0, ink: 0, dry: 0, tone: 0,
    });
  }
  const C = S.length;
  const base = HALF_WIDTH;
  let [vmin, vmax] = [Infinity, -Infinity];
  for (let i = 0; i < C; i++) {
    const [a, b] = [S[Math.max(0, i - 1)], S[Math.min(C - 1, i + 1)]];
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const d = Math.hypot(dx, dy) || 1;
    Object.assign(S[i], { tx: dx / d, ty: dy / d, nx: -dy / d, ny: dx / d });
    const press = clamp(S[i].p, 0.015, 1.6) * taper(S[i].t, g.entry, g.exit, speed) * (0.35 + 1.1 * weight);
    S[i].hw = Math.max(0.35 * PX, base * press);
    vmin = Math.min(vmin, S[i].v);
    vmax = Math.max(vmax, S[i].v);
  }
  // a slow hand shakes a little
  const shake = (0.25 + 0.6 * (1 - speed)) * PX;
  for (const pt of S) {
    const o = (wobble((0.045 / PX) * pt.s) - 0.5) * 2 * shake;
    pt.x += pt.nx * o;
    pt.y += pt.ny * o;
  }

  // The brush gives up ink as it goes: faster, heavier and drier brushes run
  // out sooner, and the drier it gets the paler and more broken the ink.
  let ink = load;
  let dryness = 0;
  const longish = clamp(length / (0.15 * INK_REACH), 0.35, 1);
  for (let i = 0; i < C; i++) {
    const pt = S[i];
    const ds = i ? pt.s - S[i - 1].s : 0;
    ink -= (ds * (1.35 - 1.15 * wet) * (0.55 + 0.85 * speed) * (0.5 + (0.5 * pt.hw) / base)) / INK_REACH;
    pt.ink = ink;
    pt.dry = clamp(1 - ink + 0.22 * (dryAt((0.03 / PX) * pt.s) - 0.5), 0, 1.3);
    dryness += clamp(pt.dry, 0, 1);
    pt.vn = (pt.v - vmin) / Math.max(1e-6, vmax - vmin);
    const pale = 0.2 * Math.pow(clamp(pt.dry, 0, 1), 1.2) + 0.1 * pt.vn * longish;
    pt.tone = clamp(0.09 + pale + 0.05 * (toneAt((0.08 / PX) * pt.s) - 0.5), 0.06, 0.48);
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // wet ink bleeds into the paper where the brush went slowly
  if (wet > 0.5) {
    for (let i = 0; i < C; i += 2) {
      const pt = S[i];
      const alpha = (0.035 + (0.085 * (wet - 0.5)) / 0.5) * Math.pow(1 - pt.vn, 1.8) * (clamp(pt.ink, 0, 1.4) / 1.4);
      if (alpha < 0.008 || pt.hw < 2 * PX) continue;
      const r = pt.hw * (1.06 + 0.16 * wet);
      const halo = ctx.createRadialGradient(pt.x, pt.y, 0.72 * pt.hw, pt.x, pt.y, r);
      halo.addColorStop(0, `rgba(66,59,50,${alpha})`);
      halo.addColorStop(1, "rgba(66,59,50,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // the body, with edges that wander more as the brush dries; each piece
  // reaches over the next so no seam shows between them
  for (let i = 0; i < C - 1; i++) {
    const [a, b] = [S[i], S[Math.min(C - 1, i + 2)]];
    const rough = (pt: Sample): number => 0.016 + 0.055 * clamp(pt.dry, 0, 1);
    const freq = (0.1 + 0.14 * clamp(a.dry, 0, 1)) / PX;
    const side = (pt: Sample, edge: (x: number) => number): number =>
      pt.hw * (1 + rough(pt) * (edge(pt.s * freq) - 0.5) * 2);
    const [aL, aR, bL, bR] = [side(a, edgeL), side(a, edgeR), side(b, edgeL), side(b, edgeR)];
    ctx.fillStyle = grey(a.tone);
    ctx.beginPath();
    ctx.moveTo(a.x + a.nx * aL, a.y + a.ny * aL);
    ctx.lineTo(b.x + b.nx * bL, b.y + b.ny * bL);
    ctx.lineTo(b.x - b.nx * bR, b.y - b.ny * bR);
    ctx.lineTo(a.x - a.nx * aR, a.y - a.ny * aR);
    ctx.closePath();
    ctx.fill();
  }

  // Where the brush was pressed down and lifted. A pressed start leaves a
  // slanted head, since the tip goes in on the diagonal (逆锋起笔).
  const blob = (pt: Sample, size: number, shift: number, slant = false): void => {
    ctx.fillStyle = grey(pt.tone);
    ctx.beginPath();
    const r = pt.hw * size * clamp(1.18 - 0.5 * clamp(pt.dry, 0, 1.3), 0.45, 1);
    const [x, y] = [pt.x + pt.tx * shift, pt.y + pt.ty * shift];
    if (slant) ctx.ellipse(x, y, r * 1.08, r * 0.78, Math.PI / 4, 0, 2 * Math.PI);
    else ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
  };
  const [first, end] = [S[0], S[C - 1]];
  if (g.entry === "pressed") blob(first, 0.9, -0.04 * first.hw, true);
  else if (first.hw > 1.2 * PX) blob(first, 0.88, 0);
  if (g.exit !== "tapered") blob(end, 0.94, 0.05 * end.hw);
  else if (end.hw > 1.2 * PX) blob(end, 0.88, 0);

  // ink pools where the brush rested
  const pools = [...g.pools];
  if (g.entry === "pressed") pools.push({ t: 0.03, k: 0.36 });
  if (g.exit === "blunt") pools.push({ t: 0.965, k: 0.45 });
  for (const pool of pools) {
    const pt = S[clamp(Math.round(pool.t * (C - 1)), 0, C - 1)];
    const depth = pool.k * (0.05 + 0.08 * wet) * clamp(pt.ink, 0, 1.2);
    if (depth < 0.01) continue;
    for (let ring = 0; ring < 3; ring++) {
      const r = pt.hw * (1.05 - 0.22 * ring);
      const fill = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
      fill.addColorStop(0, `rgba(22,18,14,${depth * (0.5 + 0.25 * ring)})`);
      fill.addColorStop(1, "rgba(22,18,14,0)");
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // Dry brush (飞白): bristles running out of ink leave paper showing through
  // in streaks. Each bristle is a line along the stroke that erases where it's
  // dry; runs of the same strength are erased in one go.
  ctx.globalCompositeOperation = "destination-out";
  const bristles = clamp(Math.round((1.2 * base) / PX), 8, 26);
  const thick = clamp(base / PX / 20, 0.45, 1.2);
  for (let b = 0; b < bristles; b++) {
    const across = -1 + (2 * b) / (bristles - 1) + (rand() - 0.5) * 0.06;
    const phase = 200 * rand();
    ctx.lineWidth = (0.5 + 1.9 * rand()) * thick * PX;
    const gain = 1 / (0.72 + 0.55 * rand());
    const edge = 0.55 + 0.8 * Math.abs(across);
    const gaps = rand() < 0.55 ? (0.02 + 0.045 * rand()) * (1 - 0.45 * wet) : 0;
    const strength = (pt: Sample): number => {
      const c = clamp(pt.dry, 0, 1.3) * edge * gain * (0.72 + 0.55 * dryAt((0.12 / PX) * pt.s + phase));
      const a = c > 0.42 ? clamp((c - 0.42) * 2.3, 0, 0.95) : 0;
      return Math.max(a, gaps * (0.5 + 0.9 * dryAt((0.05 / PX) * pt.s + 1.7 * phase)));
    };
    const off = (pt: Sample): [number, number] => [pt.x + pt.nx * pt.hw * 0.92 * across, pt.y + pt.ny * pt.hw * 0.92 * across];
    let run = 0;
    for (let i = 0; i < C - 1; i++) {
      const a = Math.round(strength(S[i]) * 64) / 64;
      if (a !== run) {
        if (run >= 0.012) ctx.stroke();
        run = a;
        if (a >= 0.012) {
          ctx.strokeStyle = `rgba(0,0,0,${a})`;
          ctx.beginPath();
          ctx.moveTo(...off(S[i]));
        }
      }
      if (run >= 0.012) ctx.lineTo(...off(S[i + 1]));
    }
    if (run >= 0.012) ctx.stroke();
    const tip = clamp(end.dry, 0, 1.3) * edge * gain * (0.72 + 0.55 * dryAt((0.12 / PX) * end.s + phase));
    if (tip > 0.4) {
      ctx.strokeStyle = `rgba(0,0,0,${clamp((tip - 0.4) * 2, 0, 0.95)})`;
      const [x, y] = off(end);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + end.tx * end.hw * 1.5, y + end.ty * end.hw * 1.5);
      ctx.stroke();
    }
  }

  // the paper's grain shows through, more where the ink is dry
  const paper = ctx.createPattern(grain(), "repeat")!;
  paper.setTransform(new DOMMatrix().scale(PX));
  ctx.globalAlpha = 0.05 + 0.24 * clamp(dryness / C, 0, 1);
  ctx.fillStyle = paper;
  const [xs, ys] = [S.map((pt) => pt.x), S.map((pt) => pt.y)];
  const [x0, y0] = [Math.min(...xs) - 3 * base, Math.min(...ys) - 3 * base];
  ctx.fillRect(x0, y0, Math.max(...xs) - x0 + 3 * base, Math.max(...ys) - y0 + 3 * base);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  // a quick lift leaves a few hairs of ink trailing off the end
  if (g.exit === "tapered" && speed > 0.35) {
    const hairs = 2 + Math.round(3 * speed * rand() + 2 * speed);
    for (let h = 0; h < hairs; h++) {
      const pt = S[clamp(Math.round((0.88 + 0.07 * rand()) * (C - 1)), 0, C - 2)];
      const turn = (rand() - 0.5) * 0.5;
      const [dx, dy] = [Math.cos(turn) * end.tx - Math.sin(turn) * end.ty, Math.sin(turn) * end.tx + Math.cos(turn) * end.ty];
      const reach = (0.25 + 1.2 * speed) * base * (0.5 + 0.8 * rand());
      const bend = (rand() - 0.5) * reach * 0.5;
      ctx.strokeStyle = grey(clamp(pt.tone + 0.08, 0, 0.55), (0.1 + 0.22 * rand()) * clamp(pt.ink + 0.6, 0.2, 1));
      ctx.lineWidth = (0.5 + 0.9 * rand()) * PX;
      const start = (rand() - 0.5) * pt.hw * 1.4;
      const [x, y] = [pt.x + pt.nx * start, pt.y + pt.ny * start];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + dx * reach * 0.5 + pt.nx * bend * 0.5,
        y + dy * reach * 0.5 + pt.ny * bend * 0.5,
        x + dx * reach + pt.nx * bend,
        y + dy * reach + pt.ny * bend,
      );
      ctx.stroke();
    }
  }
  return ink;
}

// ---- a character --------------------------------------------------------

const scratches = new Map<string, HTMLCanvasElement>();
function scratchFor(width: number, height: number): HTMLCanvasElement {
  const key = `${width}x${height}`;
  let canvas = scratches.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = [width, height];
    scratches.set(key, canvas);
  }
  return canvas;
}

// Each stroke is drawn on its own, so its dry streaks only cut into itself,
// then laid over what's there with multiply: where strokes cross, the ink
// is darker, as it is on paper.
function addStroke(target: HTMLCanvasElement, stroke: Stroke, index: number, style: BrushStyle, left: number, last: boolean): number {
  const full = 0.55 + 0.8 * style.wetness;
  // a brush that's nearly dry goes back to the inkstone
  const load = left < 0.3 + 0.15 * style.wetness ? full : left;
  const scratch = scratchFor(target.width, target.height);
  const ctx = scratch.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, scratch.width, scratch.height);
  const scale = target.width / INK_BOX;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const seed = `${index}:${stroke.pts[0]}:${stroke.pts[1]}`;
  const after = paintStroke(ctx, gesture(stroke, last), style, seed, load, 1 / scale);
  const out = target.getContext("2d")!;
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.globalCompositeOperation = "multiply";
  out.drawImage(scratch, 0, 0);
  out.globalCompositeOperation = "source-over";
  return after;
}

// A painter for one canvas. It keeps the strokes it has already drawn, so
// while someone writes only the stroke under the pen is drawn again; a new
// brush, a new size, an undo or a different character starts over.
export function inkPainter(canvas: HTMLCanvasElement) {
  const layer = document.createElement("canvas");
  let done: Stroke[] = [];
  let key = "";
  let left = 0;
  return (strokes: readonly Stroke[], style: BrushStyle, current: Stroke | null = null): void => {
    const { width, height } = canvas;
    const k = `${width}x${height}:${style.weight}:${style.wetness}:${style.speed}`;
    if (k !== key || done.length > strokes.length || done.some((s, i) => s !== strokes[i])) {
      [layer.width, layer.height] = [width, height];
      [done, key, left] = [[], k, 0.55 + 0.8 * style.wetness];
    }
    for (let i = done.length; i < strokes.length; i++) {
      left = addStroke(layer, strokes[i], i, style, left, true);
      done.push(strokes[i]);
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(layer, 0, 0);
    if (current) addStroke(canvas, current, strokes.length, style, left, false);
  };
}
