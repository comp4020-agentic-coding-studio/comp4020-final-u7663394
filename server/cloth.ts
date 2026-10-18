// The water cloth's rules (doc/adr/0006-the-water-cloth.md). Everyone with a
// name may write on a room's cloth at once; each stroke is kept exactly as
// sent, signed, until the time the server gave it, and then it is gone. Only
// its writer may dry it sooner.
import type { DatabaseSync } from "node:sqlite";
import { transaction } from "./db.ts";
import { RelayError, readStyle } from "./relay.ts";
import { isStrokeList, type Stroke } from "../shared/strokes.ts";
import { characters, TEXTS } from "../shared/texts.ts";
import {
  CLOTH_DRY_MAX_MS,
  CLOTH_DRY_MIN_MS,
  CLOTH_MAX_POINTS,
  CLOTH_PER_PERSON,
  CLOTH_PER_ROOM,
  type ClothStroke,
  type Person,
} from "../shared/api.ts";

// The cloth has a square for every character a room might be writing, so a
// square stays valid when the scroll moves on to its next line.
const SQUARES = new Set(TEXTS.flatMap((t) => characters(t).map((c) => c.char)));

// A wetter brush carries more water, and takes longer to dry.
export const dryingTime = (wetness: number): number =>
  Math.round(CLOTH_DRY_MIN_MS + (CLOTH_DRY_MAX_MS - CLOTH_DRY_MIN_MS) * wetness);

const toStroke = (row: Record<string, unknown>): ClothStroke => ({
  id: row.id as number,
  char: row.char as string,
  writer: { id: row.writer_id as string, name: row.writer_name as string },
  stroke: JSON.parse(row.stroke as string) as Stroke,
  style: {
    weight: row.style_weight as number,
    wetness: row.style_wetness as number,
    speed: row.style_speed as number,
  },
  writtenAt: row.written_at as number,
  driesAt: row.dries_at as number,
});

// Dry strokes are never shown, whether or not the sweep has reached them.
export function wetStrokes(db: DatabaseSync, room: string, now = Date.now()): ClothStroke[] {
  return db
    .prepare("SELECT * FROM cloth_strokes WHERE room = ? AND dries_at > ? ORDER BY id")
    .all(room, now)
    .map(toStroke);
}

// Gone for good once dry: the cloth keeps nothing.
export function sweep(db: DatabaseSync, now = Date.now()): number {
  return Number(db.prepare("DELETE FROM cloth_strokes WHERE dries_at <= ?").run(now).changes);
}

export function writeOnCloth(
  db: DatabaseSync,
  room: string,
  me: Person,
  char: unknown,
  stroke: unknown,
  rawStyle: unknown,
  now = Date.now(),
): ClothStroke {
  if (typeof char !== "string" || !SQUARES.has(char)) {
    throw new RelayError("invalid_request", 400, "That square isn't on the cloth.");
  }
  if (!isStrokeList([stroke]) || (stroke as Stroke).pts.length / 3 > CLOTH_MAX_POINTS) {
    throw new RelayError("invalid_strokes", 400, "That stroke couldn't be read, or it's too long.");
  }
  const style = readStyle(rawStyle);
  return transaction(db, () => {
    sweep(db, now);
    db.prepare("INSERT OR IGNORE INTO rooms (slug, created_at) VALUES (?, ?)").run(room, now);
    const count = (sql: string, ...args: (string | number)[]): number =>
      (db.prepare(sql).get(...args) as { n: number }).n;
    if (count("SELECT count(*) AS n FROM cloth_strokes WHERE room = ? AND writer_id = ?", room, me.id) >= CLOTH_PER_PERSON) {
      throw new RelayError("cloth_full", 409, "Your strokes cover the cloth. Wait for some to dry, or dry them now.");
    }
    if (count("SELECT count(*) AS n FROM cloth_strokes WHERE room = ?", room) >= CLOTH_PER_ROOM) {
      throw new RelayError("cloth_full", 409, "The cloth is soaked. Wait a moment for it to dry.");
    }
    const driesAt = now + dryingTime(style.wetness);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO cloth_strokes (room, char, writer_id, writer_name, stroke, style_weight, style_wetness,
                                    style_speed, written_at, dries_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(room, char, me.id, me.name, JSON.stringify(stroke), style.weight, style.wetness, style.speed, now, driesAt);
    return {
      id: Number(lastInsertRowid),
      char,
      writer: me,
      stroke: stroke as Stroke,
      style,
      writtenAt: now,
      driesAt,
    };
  });
}

// Dry your own wet strokes now. Whatever ids the request names, only the
// asker's strokes are touched; nothing of theirs left is a refusal.
export function dryMine(db: DatabaseSync, room: string, me: Person, now = Date.now()): number[] {
  return transaction(db, () => {
    const ids = db
      .prepare("SELECT id FROM cloth_strokes WHERE room = ? AND writer_id = ? AND dries_at > ? ORDER BY id")
      .all(room, me.id, now)
      .map((r) => r.id as number);
    if (!ids.length) throw new RelayError("nothing_wet", 409, "None of your strokes are wet.");
    db.prepare("DELETE FROM cloth_strokes WHERE room = ? AND writer_id = ?").run(room, me.id);
    return ids;
  });
}
