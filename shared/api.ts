// What the server sends and accepts. The client and the spec both read these.
import type { BrushStyle, Stroke } from "./strokes.ts";

export interface Person {
  id: string;
  name: string;
}

export interface Glyph {
  position: number;
  char: string;
  writer: Person;
  strokes: Stroke[];
  // the brush its writer drew it with, kept as they chose it
  style: BrushStyle;
  writtenAt: number;
}

export interface Scroll {
  id: number;
  room: string;
  textId: string;
  startedAt: number;
  finishedAt: number | null;
  glyphs: Glyph[];
}

export interface ScrollSummary {
  id: number;
  textId: string;
  finishedAt: number;
  writers: Person[];
}

// Who holds the brush, for which position, and until when (server clock, ms).
export interface Brush {
  holder: Person;
  position: number;
  until: number;
}

export interface RoomState {
  room: string;
  scroll: Scroll;
  brush: Brush | null;
  // the most recent writer in this room, who can't take the brush next
  lastWriter: Person | null;
  present: number;
  finished: ScrollSummary[];
  me: Person | null;
  serverNow: number;
}

// Server-sent events on /api/rooms/:room/events, by event name.
export interface RoomEvents {
  hello: { present: number };
  presence: { present: number };
  brush: { brush: Brush | null; serverNow: number };
  glyph: { scrollId: number; glyph: Glyph };
  // the scroll was finished and a fresh one has started; refetch the room
  scroll: { finishedId: number; scroll: Scroll };
  // live ink: the brush holder's draft as it is now, relayed and never stored
  ink: InkDraft;
}

export interface InkDraft {
  scrollId: number;
  position: number;
  writer: Person;
  strokes: Stroke[];
  // the stroke still being drawn, if the pen is down
  current: Stroke | null;
  // the brush as the writer has it set right now
  style: BrushStyle;
}

export type ErrorCode =
  | "name_required"
  | "invalid_name"
  | "invalid_room"
  | "invalid_strokes"
  | "invalid_style"
  | "invalid_request"
  | "pass_the_brush"
  | "brush_taken"
  | "not_your_brush"
  | "stale_position"
  | "not_found";

export interface ApiError {
  error: ErrorCode;
  message: string;
}

export const HALL = "hall";
export const ROOM_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
export const NAME_MAX = 20;
export const BRUSH_HOLD_MS = 3 * 60 * 1000;
// how often a writer's pad sends its draft to the room, at most
export const INK_EVERY_MS = 120;
