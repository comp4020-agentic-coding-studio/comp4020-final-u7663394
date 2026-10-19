// Who is watching each room right now, and how changes reach them. This is the
// only state the server keeps in memory, because it *is* connection state: a
// restart drops every stream, and clients reconnect and refetch the room.
import { log } from "./log.ts";
import type { RoomEvents } from "../shared/api.ts";

type Send = (event: string, data: string) => void;

interface Watcher {
  // a named visitor counts once however many tabs they have open
  who: string;
  send: Send;
}

export class Hub {
  private rooms = new Map<string, Set<Watcher>>();

  // `tag` is the request the stream was opened by, so the presence it
  // broadcasts reads with that request in the log.
  join(room: string, who: string, send: Send, tag = "-"): () => void {
    const watcher = { who, send };
    let watchers = this.rooms.get(room);
    if (!watchers) this.rooms.set(room, (watchers = new Set()));
    watchers.add(watcher);
    this.broadcast(room, "presence", { present: this.present(room) }, tag);
    return () => {
      watchers.delete(watcher);
      if (watchers.size === 0) this.rooms.delete(room);
      this.broadcast(room, "presence", { present: this.present(room) }, tag);
    };
  }

  present(room: string): number {
    return new Set([...(this.rooms.get(room) ?? [])].map((w) => w.who)).size;
  }

  // Each broadcast is a line saying what went to how many open streams (tabs)
  // and people, under the request that caused it. Live ink is the exception:
  // a draft is relayed and kept nowhere, and that includes the log.
  broadcast<E extends keyof RoomEvents>(room: string, event: E, data: RoomEvents[E], tag = "-"): void {
    const payload = JSON.stringify(data);
    const watchers = this.rooms.get(room) ?? new Set<Watcher>();
    for (const watcher of watchers) watcher.send(event, payload);
    if (event !== "ink") log(tag, "broadcast", { room, event, streams: watchers.size, present: this.present(room) });
  }
}
