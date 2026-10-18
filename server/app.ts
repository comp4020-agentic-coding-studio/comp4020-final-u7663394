// The HTTP surface: the JSON API, one SSE stream per room, /readme/, and the
// built client. Each write is answered only after it is committed, and only
// then broadcast and logged.
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "@hono/node-server/serve-static";
import type { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { Hub } from "./hub.ts";
import { log, logRequest, who, type Fields } from "./log.ts";
import { renderReadme } from "./readme.ts";
import * as relay from "./relay.ts";
import * as cloth from "./cloth.ts";
import { ROOM_PATTERN, type ApiError, type Person, type RoomState } from "../shared/api.ts";
import { isDraft, type Stroke } from "../shared/strokes.ts";
import { characters, textById } from "../shared/texts.ts";

const COOKIE = "relay_visitor";
const YEAR = 60 * 60 * 24 * 365;

type Env = { Variables: { me: Person | null; tag: string; refused?: string } };

export function createApp(db: DatabaseSync, clientDir = "dist"): Hono<Env> {
  const app = new Hono<Env>();
  const hub = new Hub();
  const readme = renderReadme();
  const indexHtml = existsSync(`${clientDir}/index.html`)
    ? readFileSync(`${clientDir}/index.html`, "utf8")
    : "<!doctype html><title>Calligraphy Relay</title><p>The client isn't built: run <code>pnpm build</code>.</p>";

  // A timer per room so everyone sees a brush that runs out put back down.
  const expiries = new Map<string, NodeJS.Timeout>();
  const announceBrush = (room: string): void => {
    clearTimeout(expiries.get(room));
    const brush = relay.currentBrush(db, room);
    hub.broadcast(room, "brush", { brush, serverNow: Date.now() });
    if (brush) {
      expiries.set(
        room,
        setTimeout(() => {
          log("-", "brush.expire", { room, position: brush.position, ...who(brush.holder) });
          announceBrush(room);
        }, brush.until - Date.now() + 50),
      );
    }
  };
  // "which character": the position and the character itself, to read the log by
  const at = (scrollId: number, textId: string, position: number): Fields => {
    const text = textById(textId);
    return { scroll: scrollId, position, char: text ? characters(text)[position]?.char : undefined };
  };

  const roomOf = (c: Context<Env>): string => {
    const room = c.req.param("room") ?? "";
    if (!ROOM_PATTERN.test(room)) {
      throw new relay.RelayError("invalid_room", 400, "A room name is lowercase letters, digits and dashes.");
    }
    return room;
  };
  const needMe = (c: Context<Env>): Person => {
    const me = c.get("me");
    if (!me) throw new relay.RelayError("name_required", 401, "Choose a name before writing.");
    return me;
  };
  const body = async (c: Context<Env>): Promise<Record<string, unknown>> => {
    try {
      const json = await c.req.json();
      if (typeof json === "object" && json !== null) return json as Record<string, unknown>;
    } catch {
      // fall through
    }
    throw new relay.RelayError("invalid_request", 400, "The request wasn't JSON.");
  };

  app.onError((err, c) => {
    if (err instanceof relay.RelayError) {
      c.set("refused", err.code);
      return c.json<ApiError>({ error: err.code, message: err.message }, err.status);
    }
    c.set("refused", "server_error");
    console.error(`[${c.get("tag") ?? "-"}] error ${c.req.method} ${c.req.path}`, err);
    return c.json({ error: "server_error", message: "Something went wrong on the server." }, 500);
  });

  app.use(secureHeaders());
  // Who is asking comes from the cookie and nowhere else. Every API request is
  // logged when its answer goes out, with who sent it and, if it was refused,
  // why. Accepted live ink is the exception: a draft is kept nowhere, and that
  // includes the log.
  app.use("/api/*", async (c, next) => {
    const started = performance.now();
    c.set("tag", randomBytes(3).toString("hex"));
    c.set("me", relay.visitorByToken(db, getCookie(c, COOKIE)));
    await next();
    const { method } = c.req;
    if (method === "GET" && c.res.ok) return;
    if (method === "PUT" && c.req.path.endsWith("/ink") && c.res.ok) return;
    const ms = Math.round(performance.now() - started);
    logRequest(c.get("tag"), method, c.req.path, c.res.status, ms, { ...who(c.get("me")), error: c.get("refused") });
  });
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 256 * 1024,
      onError: (c) => {
        c.set("refused", "too_large");
        return c.json<ApiError>({ error: "invalid_strokes", message: "That drawing is too large." }, 413);
      },
    }),
  );

  // ---- people ----

  app.get("/api/me", (c) => c.json({ me: c.get("me") }));

  // Choosing a name makes you a person here: a long-lived cookie holds the
  // secret, so this browser is still you when you come back.
  app.put("/api/me", async (c) => {
    const name = relay.normaliseName((await body(c)).name);
    const me = c.get("me");
    if (me) {
      const renamed = relay.renameVisitor(db, me.id, name);
      log(c.get("tag"), "visitor.rename", { ...who(renamed), was: me.name });
      c.set("me", renamed);
      return c.json({ me: renamed });
    }
    const { person, token } = relay.createVisitor(db, name);
    log(c.get("tag"), "visitor.join", who(person));
    c.set("me", person);
    setCookie(c, COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: c.req.header("x-forwarded-proto") === "https",
      path: "/",
      maxAge: YEAR,
    });
    return c.json({ me: person }, 201);
  });

  // ---- rooms ----

  app.get("/api/rooms/:room", (c) => {
    const room = roomOf(c);
    const state: RoomState = {
      room,
      scroll: relay.openScroll(db, room),
      brush: relay.currentBrush(db, room),
      lastWriter: relay.lastWriter(db, room),
      present: hub.present(room),
      finished: relay.finishedScrolls(db, room),
      me: c.get("me"),
      serverNow: Date.now(),
    };
    return c.json(state);
  });

  // A room open in a browser. Opening and closing are logged with who, so the
  // log shows who was watching; someone without a name is "-".
  app.get("/api/rooms/:room/events", (c) => {
    const room = roomOf(c);
    const me = c.get("me");
    const tag = c.get("tag");
    const watcher = me?.id ?? `anon:${randomUUID()}`;
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      const opened = Date.now();
      const leave = hub.join(room, watcher, (event, data) => {
        stream.writeSSE({ event, data }).catch(() => {});
      });
      log(tag, "room.open", { room, ...who(me), present: hub.present(room) });
      await stream.writeSSE({ event: "hello", data: JSON.stringify({ present: hub.present(room) }) });
      // proxies close streams that look idle
      const beat = setInterval(() => stream.write(": beat\n\n").catch(() => {}), 15_000);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(beat);
      leave();
      // by their name now, in case they renamed while watching
      const now = me && relay.visitorById(db, me.id);
      const after = `${Math.round((Date.now() - opened) / 1000)}s`;
      log(tag, "room.close", { room, ...who(now ?? me), present: hub.present(room), after });
    });
  });

  app.post("/api/rooms/:room/brush", async (c) => {
    const room = roomOf(c);
    const me = needMe(c);
    const brush = relay.takeBrush(db, room, me, (await body(c)).position);
    const scroll = relay.openScrollText(db, room);
    log(c.get("tag"), "brush.take", { room, ...at(scroll.id, scroll.textId, brush.position), ...who(me) });
    announceBrush(room);
    return c.json({ brush });
  });

  app.delete("/api/rooms/:room/brush", (c) => {
    const room = roomOf(c);
    const me = needMe(c);
    relay.putDownBrush(db, room, me);
    log(c.get("tag"), "brush.put_down", { room, ...who(me) });
    announceBrush(room);
    return c.body(null, 204);
  });

  // Live ink: the holder's draft, with the brush as they have it set, passed
  // straight on to everyone watching. It is never stored; only the character
  // added with POST .../glyphs is kept.
  app.put("/api/rooms/:room/ink", async (c) => {
    const room = roomOf(c);
    const me = needMe(c);
    const { position, strokes, current, style } = await body(c);
    if (!isDraft(strokes, current)) {
      throw new relay.RelayError("invalid_strokes", 400, "That drawing couldn't be read, or it's too large.");
    }
    const brushStyle = relay.readStyle(style);
    const scrollId = relay.checkInk(db, room, me, position);
    hub.broadcast(room, "ink", {
      scrollId,
      position: position as number,
      writer: me,
      strokes: strokes as Stroke[],
      current: current as Stroke | null,
      style: brushStyle,
    });
    return c.body(null, 204);
  });

  app.post("/api/rooms/:room/glyphs", async (c) => {
    const room = roomOf(c);
    const me = needMe(c);
    const { position, strokes, style } = await body(c);
    const written = relay.writeGlyph(db, room, me, position, strokes, style);
    const { glyph } = written;
    // what was added and with which brush, never the points themselves
    log(c.get("tag"), "glyph.add", {
      room,
      scroll: written.scrollId,
      position: glyph.position,
      char: glyph.char,
      strokes: glyph.strokes.length,
      points: glyph.strokes.reduce((n, s) => n + s.pts.length / 3, 0),
      brush: `${glyph.style.weight}/${glyph.style.wetness}/${glyph.style.speed}`,
      ...who(me),
    });
    hub.broadcast(room, "glyph", { scrollId: written.scrollId, glyph });
    if (written.finished) {
      const writers = new Set(relay.getScroll(db, written.finished.finishedId).glyphs.map((g) => g.writer.id)).size;
      log(c.get("tag"), "scroll.finish", { room, scroll: written.finished.finishedId, writers, ...who(me) });
      hub.broadcast(room, "scroll", written.finished);
    }
    announceBrush(room);
    return c.json(written, 201);
  });

  // ---- the water cloth (doc/adr/0006-the-water-cloth.md) ----

  app.get("/api/rooms/:room/cloth", (c) => {
    const room = roomOf(c);
    return c.json({ strokes: cloth.wetStrokes(db, room), serverNow: Date.now() });
  });

  // One stroke, sent when the pen lifts. Logged with who, which square and
  // how many points, never the points.
  app.post("/api/rooms/:room/cloth", async (c) => {
    const room = roomOf(c);
    const me = needMe(c);
    const { char, stroke, style } = await body(c);
    const wet = cloth.writeOnCloth(db, room, me, char, stroke, style);
    log(c.get("tag"), "cloth.write", {
      room,
      char: wet.char,
      points: wet.stroke.pts.length / 3,
      dries: `${Math.round((wet.driesAt - wet.writtenAt) / 1000)}s`,
      ...who(me),
    });
    hub.broadcast(room, "cloth", { stroke: wet, serverNow: Date.now() });
    return c.json({ stroke: wet }, 201);
  });

  // Dry your own strokes now. Who is asking comes from the cookie, so any ids
  // in the body are ignored: nobody wipes anyone else's.
  app.delete("/api/rooms/:room/cloth", (c) => {
    const room = roomOf(c);
    const me = needMe(c);
    const ids = cloth.dryMine(db, room, me);
    log(c.get("tag"), "cloth.wipe", { room, strokes: ids.length, ...who(me) });
    hub.broadcast(room, "cloth_wipe", { writer: me, ids });
    return c.json({ ids });
  });

  app.get("/api/scrolls/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) throw new relay.RelayError("not_found", 404, "No such scroll.");
    return c.json({ scroll: relay.getScroll(db, id) });
  });

  app.all("/api/*", (c) => {
    c.set("refused", "not_found");
    return c.json<ApiError>({ error: "not_found", message: "No such endpoint." }, 404);
  });

  // ---- pages ----

  app.get("/readme", (c) => c.redirect("/readme/", 301));
  app.get("/readme/", (c) => c.html(readme));
  // README images are committed under doc/ and linked relatively
  app.use("/readme/doc/*", serveStatic({ root: ".", rewriteRequestPath: (p) => p.replace(/^\/readme/, "") }));

  app.use(
    "/assets/*",
    serveStatic({
      root: clientDir,
      onFound: (_path, c) => c.header("Cache-Control", "public, max-age=31536000, immutable"),
    }),
  );
  // Only named files: a catch-all here once served the dist/ directory itself
  // for "/", as an octet-stream download (spec/pages.test.ts now checks).
  app.use("/favicon.svg", serveStatic({ root: clientDir }));
  // the introduction video and its poster; serveStatic answers Range requests
  app.use("/promo/*", serveStatic({ root: clientDir }));
  app.get("/assets/*", (c) => c.notFound());
  app.get("/promo/*", (c) => c.notFound());
  // Every other path is a page of the client: /, /r/<room>, /scroll/<id>, /video.
  app.get("*", (c) => c.html(indexHtml));

  return app;
}
