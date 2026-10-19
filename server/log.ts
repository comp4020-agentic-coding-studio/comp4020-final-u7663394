// The server's log: one line per thing that happened, on stdout, which Fly
// collects (`flyctl logs`). It is how a crit is narrated and how the deployed
// app is debugged, so every line says who, what and where
// (doc/adr/0004-who-may-change-what.md):
//
//   [3f9c1a] brush.take room=hall scroll=7 position=2 char=毕 user=1705195b as=Ada
//   [3f9c1a] broadcast room=hall event=brush streams=3 present=2
//   [3f9c1a] POST /api/rooms/hall/brush 200 3ms user=1705195b as=Ada
//
// The tag is the request, so the request and what happened inside it read
// together. A person is `user=` (the first eight characters of their visitor
// id) and `as=` (the name on their seal, already public on the scroll). Never
// logged: the cookie or its token, stroke points, accepted live ink.
import type { Person } from "../shared/api.ts";

type Value = string | number | boolean | null | undefined;
export type Fields = Record<string, Value>;

// Plain values go as they are; anything else (a name, a path) is quoted and
// escaped, so whatever someone types can't start a new line or pose as
// another field.
function value(v: Exclude<Value, undefined>): string {
  const s = String(v);
  return /^[^\s"\\=\p{Cc}\p{Cf}]+$/u.test(s) ? s : JSON.stringify(s);
}

function fields(f: Fields): string {
  return Object.entries(f)
    .filter((entry): entry is [string, Exclude<Value, undefined>] => entry[1] !== undefined)
    .map(([k, v]) => ` ${k}=${value(v)}`)
    .join("");
}

export const who = (person: Person | null): Fields =>
  person ? { user: person.id.slice(0, 8), as: person.name } : { user: "-" };

// An event, under the request it happened in ("-" for none, e.g. a timer).
export function log(tag: string, event: string, f: Fields = {}): void {
  console.log(`[${tag}] ${event}${fields(f)}`);
}

// The request line, written when the answer goes out.
export function logRequest(tag: string, method: string, path: string, status: number, ms: number, f: Fields): void {
  console.log(`[${tag}] ${method} ${value(path)} ${status} ${ms}ms${fields(f)}`);
}
