// Sending the pad's draft to the room as live ink (doc/adr/0002-live-ink.md).
//
// Only the latest draft matters, so this keeps at most one request in flight
// and one every INK_EVERY_MS, and drops anything superseded in between. One at
// a time also keeps drafts in order on the way to the server. A lost draft is
// fine: the next one replaces it, and the character itself goes by its own
// request, so a failure here is never shown to the writer.
import { INK_EVERY_MS } from "../../shared/api.ts";
import type { Stroke } from "../../shared/strokes.ts";

export interface Draft {
  position: number;
  strokes: Stroke[];
  current: Stroke | null;
}

export function inkSender(send: (draft: Draft) => Promise<unknown>) {
  let latest: Draft | null = null;
  let inFlight = false;
  let lastSent = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  async function pump(): Promise<void> {
    if (stopped || inFlight || timer !== undefined || !latest) return;
    const wait = lastSent + INK_EVERY_MS - Date.now();
    if (wait > 0) {
      timer = setTimeout(() => {
        timer = undefined;
        void pump();
      }, wait);
      return;
    }
    const draft = latest;
    latest = null;
    inFlight = true;
    lastSent = Date.now();
    try {
      await send(draft);
    } catch {
      // the next draft, or the character itself, takes its place
    } finally {
      inFlight = false;
      void pump();
    }
  }

  return {
    push(draft: Draft): void {
      latest = draft;
      void pump();
    },
    stop(): void {
      stopped = true;
      latest = null;
      clearTimeout(timer);
    },
  };
}
