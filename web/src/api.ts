// Talking to the server. Every failure comes back as an ApiFailure with a code
// the views can explain; "network" means the request never got an answer.
import { ref } from "vue";
import type { ApiError, Brush, Person, RoomState, Scroll } from "../../shared/api.ts";
import type { Stroke } from "../../shared/strokes.ts";

export class ApiFailure extends Error {
  code: ApiError["error"] | "network" | "server_error";
  status: number;
  constructor(code: ApiFailure["code"], status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure("network", 0, "Couldn't reach the server. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json as Partial<ApiError> | null;
    throw new ApiFailure(err?.error ?? "server_error", res.status, err?.message ?? "Something went wrong.");
  }
  return json as T;
}

const room = (name: string): string => `/api/rooms/${encodeURIComponent(name)}`;

export const api = {
  me: () => call<{ me: Person | null }>("GET", "/api/me"),
  setName: (name: string) => call<{ me: Person }>("PUT", "/api/me", { name }),
  room: (name: string) => call<RoomState>("GET", room(name)),
  takeBrush: (name: string, position: number) => call<{ brush: Brush }>("POST", `${room(name)}/brush`, { position }),
  putDownBrush: (name: string) => call<void>("DELETE", `${room(name)}/brush`),
  write: (name: string, position: number, strokes: Stroke[]) =>
    call<unknown>("POST", `${room(name)}/glyphs`, { position, strokes }),
  scroll: (id: number) => call<{ scroll: Scroll }>("GET", `/api/scrolls/${id}`),
  events: (name: string) => new EventSource(`${room(name)}/events`),
};

// Who this browser is, shared by every view.
export const me = ref<Person | null>(null);
export const meLoaded = api.me().then(
  (r) => (me.value = r.me),
  () => null,
);
