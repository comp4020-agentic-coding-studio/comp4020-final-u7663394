// The database: one SQLite file on the volume. The schema holds the rules a
// bug in the server mustn't be able to break --- one character per position,
// one open scroll per room, every character tied to a real writer.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Append-only: a shipped migration is never edited, only followed by a new
// one. PRAGMA user_version records how many have run.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE visitors (
    id         TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 20),
    created_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE rooms (
    slug       TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE scrolls (
    id          INTEGER PRIMARY KEY,
    room        TEXT NOT NULL REFERENCES rooms(slug),
    text_id     TEXT NOT NULL,
    started_at  INTEGER NOT NULL,
    finished_at INTEGER,
    -- the brush: who may write the next character, until when
    brush_holder TEXT REFERENCES visitors(id),
    brush_until  INTEGER
  ) STRICT;
  CREATE UNIQUE INDEX one_open_scroll_per_room ON scrolls(room) WHERE finished_at IS NULL;

  CREATE TABLE glyphs (
    scroll_id  INTEGER NOT NULL REFERENCES scrolls(id),
    position   INTEGER NOT NULL CHECK (position >= 0),
    char       TEXT NOT NULL,
    writer_id  TEXT NOT NULL REFERENCES visitors(id),
    -- the name as it was when they wrote: a later rename doesn't re-sign the scroll
    writer_name TEXT NOT NULL,
    strokes    TEXT NOT NULL,
    written_at INTEGER NOT NULL,
    PRIMARY KEY (scroll_id, position)
  ) STRICT;
  CREATE INDEX glyphs_by_time ON glyphs(written_at);
  `,
  // The brush each character was written with, as its writer set it. A
  // character from before there was a choice gets the default brush.
  `
  ALTER TABLE glyphs ADD COLUMN style_weight REAL NOT NULL DEFAULT 0.55 CHECK (style_weight BETWEEN 0 AND 1);
  ALTER TABLE glyphs ADD COLUMN style_wetness REAL NOT NULL DEFAULT 0.42 CHECK (style_wetness BETWEEN 0 AND 1);
  ALTER TABLE glyphs ADD COLUMN style_speed REAL NOT NULL DEFAULT 0.38 CHECK (style_speed BETWEEN 0 AND 1);
  `,
  // A written character is nobody's to change, its writer included
  // (doc/adr/0004-who-may-change-what.md), so the database refuses too.
  `
  CREATE TRIGGER glyphs_never_change BEFORE UPDATE ON glyphs
  BEGIN SELECT RAISE(ABORT, 'a written character is never changed'); END;
  CREATE TRIGGER glyphs_never_removed BEFORE DELETE ON glyphs
  BEGIN SELECT RAISE(ABORT, 'a written character is never removed'); END;
  `,
  // The water cloth (doc/adr/0006-the-water-cloth.md): strokes written while
  // waiting, kept only until they dry. Nobody restyles, moves or re-signs a
  // wet stroke; drying (DELETE) is the only change.
  `
  CREATE TABLE cloth_strokes (
    id          INTEGER PRIMARY KEY,
    room        TEXT NOT NULL REFERENCES rooms(slug),
    char        TEXT NOT NULL,
    writer_id   TEXT NOT NULL REFERENCES visitors(id),
    writer_name TEXT NOT NULL,
    stroke      TEXT NOT NULL,
    style_weight  REAL NOT NULL CHECK (style_weight BETWEEN 0 AND 1),
    style_wetness REAL NOT NULL CHECK (style_wetness BETWEEN 0 AND 1),
    style_speed   REAL NOT NULL CHECK (style_speed BETWEEN 0 AND 1),
    written_at  INTEGER NOT NULL,
    dries_at    INTEGER NOT NULL CHECK (dries_at > written_at AND dries_at - written_at <= 90000)
  ) STRICT;
  CREATE INDEX cloth_by_room ON cloth_strokes(room, dries_at);
  CREATE TRIGGER cloth_never_changes BEFORE UPDATE ON cloth_strokes
  BEGIN SELECT RAISE(ABORT, 'a stroke on the cloth is never changed, only dried'); END;
  `,
];

export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "relay.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const { user_version: current } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let version = current; version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
    console.log(`db: migrated to version ${version + 1}`);
  }
}

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
