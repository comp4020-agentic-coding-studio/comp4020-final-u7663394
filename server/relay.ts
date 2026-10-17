// The relay's rules. Every function that changes something runs in one
// transaction, so two people pressing at the same moment get one answer each:
// the database serialises them and the second sees the first's result.
import type { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { transaction } from "./db.ts";
import { characters, TEXTS, textById } from "../shared/texts.ts";
import { DEFAULT_STYLE, isBrushStyle, isStrokeList, type BrushStyle, type Stroke } from "../shared/strokes.ts";
import {
  BRUSH_HOLD_MS,
  NAME_MAX,
  type Brush,
  type ErrorCode,
  type Glyph,
  type Person,
  type Scroll,
  type ScrollSummary,
} from "../shared/api.ts";

export class RelayError extends Error {
  code: ErrorCode;
  status: 400 | 401 | 404 | 409;
  constructor(code: ErrorCode, status: 400 | 401 | 404 | 409, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ---- people -------------------------------------------------------------

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export function normaliseName(raw: unknown): string {
  if (typeof raw !== "string") throw new RelayError("invalid_name", 400, "A name is needed.");
  const name = raw.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
  if (name.length === 0 || [...name].length > NAME_MAX) {
    throw new RelayError("invalid_name", 400, `A name is 1 to ${NAME_MAX} characters.`);
  }
  return name;
}

export function visitorByToken(db: DatabaseSync, token: string | undefined): Person | null {
  if (!token) return null;
  const row = db.prepare("SELECT id, name FROM visitors WHERE token_hash = ?").get(hashToken(token));
  return row ? { id: row.id as string, name: row.name as string } : null;
}

export function visitorById(db: DatabaseSync, id: string): Person | null {
  const row = db.prepare("SELECT id, name FROM visitors WHERE id = ?").get(id);
  return row ? { id: row.id as string, name: row.name as string } : null;
}

export function createVisitor(db: DatabaseSync, name: string): { person: Person; token: string } {
  const person = { id: randomUUID(), name };
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO visitors (id, token_hash, name, created_at) VALUES (?, ?, ?, ?)").run(
    person.id,
    hashToken(token),
    name,
    Date.now(),
  );
  return { person, token };
}

export function renameVisitor(db: DatabaseSync, id: string, name: string): Person {
  db.prepare("UPDATE visitors SET name = ? WHERE id = ?").run(name, id);
  return { id, name };
}

// ---- reading ------------------------------------------------------------

interface ScrollRow {
  id: number;
  room: string;
  text_id: string;
  started_at: number;
  finished_at: number | null;
  brush_holder: string | null;
  brush_until: number | null;
}

const lengthOf = (textId: string): number => {
  const text = textById(textId);
  if (!text) throw new Error(`unknown text ${textId}`);
  return characters(text).length;
};

function glyphsOf(db: DatabaseSync, scrollId: number): Glyph[] {
  return db
    .prepare(
      `SELECT position, char, writer_id, writer_name, strokes, written_at,
              style_weight, style_wetness, style_speed
       FROM glyphs WHERE scroll_id = ? ORDER BY position`,
    )
    .all(scrollId)
    .map((row) => ({
      position: row.position as number,
      char: row.char as string,
      writer: { id: row.writer_id as string, name: row.writer_name as string },
      strokes: JSON.parse(row.strokes as string) as Stroke[],
      style: {
        weight: row.style_weight as number,
        wetness: row.style_wetness as number,
        speed: row.style_speed as number,
      },
      writtenAt: row.written_at as number,
    }));
}

const toScroll = (db: DatabaseSync, row: ScrollRow): Scroll => ({
  id: row.id,
  room: row.room,
  textId: row.text_id,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  glyphs: glyphsOf(db, row.id),
});

export function getScroll(db: DatabaseSync, id: number): Scroll {
  const row = db.prepare("SELECT * FROM scrolls WHERE id = ?").get(id) as unknown as ScrollRow | undefined;
  if (!row) throw new RelayError("not_found", 404, "No such scroll.");
  return toScroll(db, row);
}

const selectOpen = (db: DatabaseSync, room: string): ScrollRow | undefined =>
  db.prepare("SELECT * FROM scrolls WHERE room = ? AND finished_at IS NULL").get(room) as unknown as
    | ScrollRow
    | undefined;

// The open scroll of a room, creating the room and its first scroll on first visit.
function openScrollRow(db: DatabaseSync, room: string): ScrollRow {
  const existing = selectOpen(db, room);
  if (existing) return existing;
  transaction(db, () => {
    db.prepare("INSERT OR IGNORE INTO rooms (slug, created_at) VALUES (?, ?)").run(room, Date.now());
    if (!selectOpen(db, room)) startScroll(db, room);
  });
  return selectOpen(db, room)!;
}

// Rooms work through TEXTS in order, starting again after the last.
function startScroll(db: DatabaseSync, room: string): void {
  const { n } = db.prepare("SELECT count(*) AS n FROM scrolls WHERE room = ?").get(room) as { n: number };
  db.prepare("INSERT INTO scrolls (room, text_id, started_at) VALUES (?, ?, ?)").run(
    room,
    TEXTS[n % TEXTS.length].id,
    Date.now(),
  );
}

export function openScroll(db: DatabaseSync, room: string): Scroll {
  return toScroll(db, openScrollRow(db, room));
}

// Which scroll is open and which text it is, without its characters.
export function openScrollText(db: DatabaseSync, room: string): { id: number; textId: string } {
  const row = openScrollRow(db, room);
  return { id: row.id, textId: row.text_id };
}

// The most recent writer anywhere in the room: the brush always passes, even
// from the last character of one scroll to the first of the next.
export function lastWriter(db: DatabaseSync, room: string): Person | null {
  const row = db
    .prepare(
      `SELECT g.writer_id, v.name FROM glyphs g
       JOIN scrolls s ON s.id = g.scroll_id JOIN visitors v ON v.id = g.writer_id
       WHERE s.room = ? ORDER BY g.written_at DESC, g.rowid DESC LIMIT 1`,
    )
    .get(room);
  return row ? { id: row.writer_id as string, name: row.name as string } : null;
}

// The brush as everyone else sees it: held only until it runs out.
export function currentBrush(db: DatabaseSync, room: string, now = Date.now()): Brush | null {
  const row = db
    .prepare(
      `SELECT s.id, s.brush_until, v.id AS holder_id, v.name AS holder_name,
              (SELECT count(*) FROM glyphs g WHERE g.scroll_id = s.id) AS written
       FROM scrolls s JOIN visitors v ON v.id = s.brush_holder
       WHERE s.room = ? AND s.finished_at IS NULL`,
    )
    .get(room);
  if (!row || (row.brush_until as number) <= now) return null;
  return {
    holder: { id: row.holder_id as string, name: row.holder_name as string },
    position: row.written as number,
    until: row.brush_until as number,
  };
}

export function finishedScrolls(db: DatabaseSync, room: string, limit = 20): ScrollSummary[] {
  const scrolls = db
    .prepare(
      `SELECT id, text_id, finished_at FROM scrolls
       WHERE room = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT ?`,
    )
    .all(room, limit);
  const writersOf = db.prepare(
    `SELECT writer_id, writer_name, min(position) AS first FROM glyphs
     WHERE scroll_id = ? GROUP BY writer_id ORDER BY first`,
  );
  return scrolls.map((s) => ({
    id: s.id as number,
    textId: s.text_id as string,
    finishedAt: s.finished_at as number,
    writers: writersOf
      .all(s.id as number)
      .map((w) => ({ id: w.writer_id as string, name: w.writer_name as string })),
  }));
}

// ---- writing ------------------------------------------------------------

function checkTurn(db: DatabaseSync, room: string, scroll: ScrollRow, me: Person, position: number): number {
  const next = (db.prepare("SELECT count(*) AS n FROM glyphs WHERE scroll_id = ?").get(scroll.id) as { n: number }).n;
  if (position !== next) {
    throw new RelayError("stale_position", 409, "That character has already been written.");
  }
  if (lastWriter(db, room)?.id === me.id) {
    throw new RelayError("pass_the_brush", 409, "You wrote the last character. Pass the brush to someone else.");
  }
  return next;
}

export function takeBrush(db: DatabaseSync, room: string, me: Person, position: unknown, now = Date.now()): Brush {
  if (!Number.isInteger(position)) throw new RelayError("invalid_request", 400, "Which character?");
  openScrollRow(db, room);
  return transaction(db, () => {
    const scroll = selectOpen(db, room)!;
    checkTurn(db, room, scroll, me, position as number);
    const heldByOther = scroll.brush_holder !== null && scroll.brush_holder !== me.id && scroll.brush_until! > now;
    if (heldByOther) throw new RelayError("brush_taken", 409, "Someone else is holding the brush.");
    const keep = scroll.brush_holder === me.id && scroll.brush_until! > now;
    const until = keep ? scroll.brush_until! : now + BRUSH_HOLD_MS;
    db.prepare("UPDATE scrolls SET brush_holder = ?, brush_until = ? WHERE id = ?").run(me.id, until, scroll.id);
    return { holder: me, position: position as number, until };
  });
}

// Only the holder puts the brush down. Anyone else is refused rather than told
// it worked, so the answer, and the log, say what really happened.
export function putDownBrush(db: DatabaseSync, room: string, me: Person): void {
  const { changes } = db
    .prepare(
      `UPDATE scrolls SET brush_holder = NULL, brush_until = NULL
       WHERE room = ? AND finished_at IS NULL AND brush_holder = ?`,
    )
    .run(room, me.id);
  if (changes === 0) throw new RelayError("not_your_brush", 409, "You aren't holding the brush.");
}

// The brush a character or a draft is drawn with: the writer's three numbers
// exactly as sent, or the default brush when none comes. Anything else is
// refused, never clamped into range.
export function readStyle(raw: unknown): BrushStyle {
  if (raw === undefined) return { ...DEFAULT_STYLE };
  if (!isBrushStyle(raw)) throw new RelayError("invalid_style", 400, "Those brush settings couldn't be read.");
  return { weight: raw.weight, wetness: raw.wetness, speed: raw.speed };
}

// Live ink is a draft, so nothing is written: this only checks that it comes
// from whoever holds the brush, for the character they're on, and says which
// scroll it belongs to. Runs synchronously like a commit, so a draft that
// arrives after its character went in is refused rather than shown late.
export function checkInk(db: DatabaseSync, room: string, me: Person, position: unknown): number {
  if (!Number.isInteger(position)) throw new RelayError("invalid_request", 400, "Which character?");
  const scroll = selectOpen(db, room);
  if (!scroll || scroll.brush_holder !== me.id) {
    throw new RelayError("not_your_brush", 409, "Pick up the brush before writing.");
  }
  const next = (db.prepare("SELECT count(*) AS n FROM glyphs WHERE scroll_id = ?").get(scroll.id) as { n: number }).n;
  if (position !== next) throw new RelayError("stale_position", 409, "That character has already been written.");
  return scroll.id;
}

export interface Written {
  glyph: Glyph;
  scrollId: number;
  // set when this character finished the scroll and a fresh one began
  finished: { finishedId: number; scroll: Scroll } | null;
}

export function writeGlyph(
  db: DatabaseSync,
  room: string,
  me: Person,
  position: unknown,
  strokes: unknown,
  rawStyle: unknown,
  now = Date.now(),
): Written {
  if (!Number.isInteger(position)) throw new RelayError("invalid_request", 400, "Which character?");
  if (!isStrokeList(strokes)) {
    throw new RelayError("invalid_strokes", 400, "That drawing couldn't be read, or it's too large.");
  }
  const style = readStyle(rawStyle);
  openScrollRow(db, room);
  return transaction(db, () => {
    const scroll = selectOpen(db, room)!;
    const next = checkTurn(db, room, scroll, me, position as number);
    // Held means taken and not since taken by someone else: running out of
    // time only matters if another writer picks the brush up.
    if (scroll.brush_holder !== me.id) {
      throw new RelayError("not_your_brush", 409, "Pick up the brush before writing.");
    }
    const text = textById(scroll.text_id)!;
    const glyph: Glyph = {
      position: next,
      char: characters(text)[next].char,
      writer: me,
      strokes,
      style,
      writtenAt: now,
    };
    db.prepare(
      `INSERT INTO glyphs (scroll_id, position, char, writer_id, writer_name, strokes, written_at,
                           style_weight, style_wetness, style_speed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      scroll.id,
      next,
      glyph.char,
      me.id,
      me.name,
      JSON.stringify(strokes),
      now,
      style.weight,
      style.wetness,
      style.speed,
    );
    db.prepare("UPDATE scrolls SET brush_holder = NULL, brush_until = NULL WHERE id = ?").run(scroll.id);

    let finished: Written["finished"] = null;
    if (next + 1 === lengthOf(scroll.text_id)) {
      db.prepare("UPDATE scrolls SET finished_at = ? WHERE id = ?").run(now, scroll.id);
      startScroll(db, room);
      finished = { finishedId: scroll.id, scroll: toScroll(db, selectOpen(db, room)!) };
    }
    return { glyph, scrollId: scroll.id, finished };
  });
}
