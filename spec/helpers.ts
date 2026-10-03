// Helpers for the relay checks. Every check that writes does so in a fresh
// `spec-…` room, so running the spec against a live app never touches the
// hall or anyone's real scroll.
import { randomUUID } from "node:crypto";
import type { Stroke } from "../shared/strokes.ts";

export interface Visitor {
  id: string;
  name: string;
  cookie: string;
}

export const freshRoom = (): string => `spec-${randomUUID().slice(0, 8)}`;

// A small "drawing": three strokes, one with real pen pressure.
export const DRAWING: Stroke[] = [
  { pts: [120, 200, 0.5, 480, 210, 0.5, 860, 190, 0.5], pen: false },
  { pts: [500, 80, 0.31, 505, 500, 0.62, 498, 930, 0.88], pen: true },
  { pts: [250, 700, 0.5, 750, 720, 0.5], pen: false },
];

export function api(baseUrl: string) {
  async function call(
    method: string,
    path: string,
    opts: { as?: Visitor; body?: unknown; raw?: string } = {},
  ): Promise<{ status: number; json: any; headers: Headers }> {
    const headers: Record<string, string> = {};
    if (opts.as) headers.cookie = opts.as.cookie;
    let body: string | undefined;
    if (opts.raw !== undefined || opts.body !== undefined) {
      headers["content-type"] = "application/json";
      body = opts.raw ?? JSON.stringify(opts.body);
    }
    const res = await fetch(new URL(path, baseUrl), { method, headers, body });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
  }

  async function visitor(name: string): Promise<Visitor> {
    const res = await call("PUT", "/api/me", { body: { name } });
    if (res.status !== 201) throw new Error(`couldn't create visitor: ${res.status}`);
    const cookie = res.headers.getSetCookie()[0].split(";")[0];
    return { ...res.json.me, cookie };
  }

  // Take the brush for the next character and write it.
  async function write(room: string, as: Visitor, strokes: Stroke[] = DRAWING) {
    const state = await call("GET", `/api/rooms/${room}`);
    const position = state.json.scroll.glyphs.length;
    const take = await call("POST", `/api/rooms/${room}/brush`, { as, body: { position } });
    if (take.status !== 200) return take;
    return call("POST", `/api/rooms/${room}/glyphs`, { as, body: { position, strokes } });
  }

  return { call, visitor, write };
}

export interface SseEvent {
  event: string;
  data: any;
  at: number;
}

// An open /events stream, as a browser's EventSource would hold it.
export async function openStream(baseUrl: string, room: string, as?: Visitor) {
  const ctrl = new AbortController();
  const res = await fetch(new URL(`/api/rooms/${room}/events`, baseUrl), {
    headers: as ? { cookie: as.cookie } : {},
    signal: ctrl.signal,
  });
  const events: SseEvent[] = [];
  const waiting: { wake?: () => void } = {};

  void (async () => {
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let end;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = block.match(/^event: ?(.*)$/m)?.[1];
          const data = block.match(/^data: ?(.*)$/m)?.[1];
          if (event && data !== undefined) {
            events.push({ event, data: JSON.parse(data), at: performance.now() });
            waiting.wake?.();
          }
        }
      }
    } catch {
      // aborted
    }
  })();

  // Resolves with the first event (from `from` on) that matches, or rejects.
  async function waitFor(match: (e: SseEvent) => boolean, timeoutMs = 3000, from = 0): Promise<SseEvent> {
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      const found = events.slice(from).find(match);
      if (found) return found;
      const left = deadline - performance.now();
      if (left <= 0) throw new Error(`no matching event within ${timeoutMs} ms; got ${events.map((e) => e.event)}`);
      await new Promise<void>((resolve) => {
        waiting.wake = resolve;
        setTimeout(resolve, left);
      });
    }
  }

  await waitFor((e) => e.event === "hello");
  return { events, waitFor, close: () => ctrl.abort() };
}
