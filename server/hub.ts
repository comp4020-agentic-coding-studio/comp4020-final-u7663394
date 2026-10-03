// Who is watching each room right now, and how changes reach them. This is the
// only state the server keeps in memory, because it *is* connection state: a
// restart drops every stream, and clients reconnect and refetch the room.
import type { RoomEvents } from "../shared/api.ts";

type Send = (event: string, data: string) => void;

interface Watcher {
  // a named visitor counts once however many tabs they have open
  who: string;
  send: Send;
}

export class Hub {
  private rooms = new Map<string, Set<Watcher>>();

  join(room: string, who: string, send: Send): () => void {
    const watcher = { who, send };
    let watchers = this.rooms.get(room);
    if (!watchers) this.rooms.set(room, (watchers = new Set()));
    watchers.add(watcher);
    this.broadcast(room, "presence", { present: this.present(room) });
    return () => {
      watchers.delete(watcher);
      if (watchers.size === 0) this.rooms.delete(room);
      this.broadcast(room, "presence", { present: this.present(room) });
    };
  }

  present(room: string): number {
    return new Set([...(this.rooms.get(room) ?? [])].map((w) => w.who)).size;
  }

  broadcast<E extends keyof RoomEvents>(room: string, event: E, data: RoomEvents[E]): void {
    const payload = JSON.stringify(data);
    for (const watcher of this.rooms.get(room) ?? []) watcher.send(event, payload);
  }
}
