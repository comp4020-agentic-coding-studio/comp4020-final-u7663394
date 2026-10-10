// The HTTP surface: the JSON API, one SSE stream per room, /readme/, and the
// built client. Each write is answered only after it is committed, and only
// then broadcast.
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "@hono/node-server/serve-static";
import type { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Hub } from "./hub.ts";
import { renderReadme } from "./readme.ts";
import * as relay from "./relay.ts";
import { ROOM_PATTERN, type ApiError, type Person, type RoomState } from "../shared/api.ts";
import { isDraft, type Stroke } from "../shared/strokes.ts";

const COOKIE = "relay_visitor";
const YEAR = 60 * 60 * 24 * 365;

type Env = { Variables: { me: Person | null } };

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
    if (brush) expiries.set(room, setTimeout(() => announceBrush(room), brush.until - Date.now() + 50));
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
      return c.json<ApiError>({ error: err.code, message: err.message }, err.status);
    }
    console.error(err);
    return c.json({ error: "server_error", message: "Something went wrong on the server." }, 500);
  });

  app.use(secureHeaders());
  app.use("/api/*", async (c, next) => {
    c.set("me", relay.visitorByToken(db, getCookie(c, COOKIE)));
    await next();
  });
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 256 * 1024,
      onError: (c) => c.json<ApiError>({ error: "invalid_strokes", message: "That drawing is too large." }, 413),
    }),
  );

  // ---- people ----

  app.get("/api/me", (c) => c.json({ me: c.get("me") }));

  // Choosing a name makes you a person here: a long-lived cookie holds the
  // secret, so this browser is still you when you come back.
  app.put("/api/me", async (c) => {
    const name = relay.normaliseName((await body(c)).name);
    const me = c.get("me");
    if (me) return c.json({ me: relay.renameVisitor(db, me.id, name) });
    const { person, token } = relay.createVisitor(db, name);
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

  app.get("/api/rooms/:room/events", (c) => {
    const room = roomOf(c);
    const who = c.get("me")?.id ?? `anon:${randomUUID()}`;
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      const leave = hub.join(room, who, (event, data) => {
        stream.writeSSE({ event, data }).catch(() => {});
      });
      await stream.writeSSE({ event: "hello", data: JSON.stringify({ present: hub.present(room) }) });
      // proxies close streams that look idle
      const beat = setInterval(() => stream.write(": beat\n\n").catch(() => {}), 15_000);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(beat);
      leave();
    });
  });

  app.post("/api/rooms/:room/brush", async (c) => {
    const room = roomOf(c);
    const brush = relay.takeBrush(db, room, needMe(c), (await body(c)).position);
    announceBrush(room);
    return c.json({ brush });
  });

  app.delete("/api/rooms/:room/brush", (c) => {
    const room = roomOf(c);
    relay.putDownBrush(db, room, needMe(c));
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
    console.log(`glyph room=${room} scroll=${written.scrollId} position=${written.glyph.position} writer=${me.id}`);
    hub.broadcast(room, "glyph", { scrollId: written.scrollId, glyph: written.glyph });
    if (written.finished) {
      console.log(`scroll finished room=${room} scroll=${written.finished.finishedId}`);
      hub.broadcast(room, "scroll", written.finished);
    }
    announceBrush(room);
    return c.json(written, 201);
  });

  app.get("/api/scrolls/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) throw new relay.RelayError("not_found", 404, "No such scroll.");
    return c.json({ scroll: relay.getScroll(db, id) });
  });

  app.all("/api/*", (c) => c.json<ApiError>({ error: "not_found", message: "No such endpoint." }, 404));

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
  app.get("/assets/*", (c) => c.notFound());
  // Every other path is a page of the client: /, /r/<room>, /scroll/<id>.
  app.get("*", (c) => c.html(indexHtml));

  return app;
}
