# 5. A browser watches its room again once it has a name

Date: 2026-10-18

## Status

Accepted. Adds to ADR 0004 (what the log says); nothing in it is replaced.

## Context

After ADR 0004 every change named its person in the log. Then I ran the crit
the way it really happens, two people in two separate browsers, and read the
log the server printed. Ada and Bo were named on every change, but the lines
that say who is in the room were:

```
[2a527b] room.open room=table-4 user=- present=2
[2a527b] room.close room=table-4 user=- present=1 after=94s
```

A browser opens its room stream as soon as the page loads, which is before its
person has chosen a name, and it kept that stream for as long as the page was
open. So the server saw both of them as nobody until they left. The API checks
couldn't catch this, because they always opened the stream with a cookie
already set.

## Options

1. *Leave it.* Changes are still named. But at the crit I couldn't say who was
   watching, and presence counted the same person as a nameless watcher and,
   from a second tab, as themselves: two people where there was one.
2. *Send who you are on the stream URL* (`?visitor=…`). Then anyone could claim
   to be anyone just by editing a URL, which breaks "who is asking comes only
   from the cookie".
3. *Open the stream again when this browser's person changes* (chosen). The
   cookie is set by then, so the new stream is theirs.

## Decision

`web/src/useRoom.ts` reconnects when the id of this browser's person changes,
which is when they first choose a name. A rename keeps the same id, so it
doesn't reconnect. The server reads the name again when the stream closes, so
`room.close` uses the name they have then.

## Consequences

- At the moment someone joins, the room count dips by one for a moment and
  comes back, and their page shows "reconnecting…" for about as long as one
  request takes. That dip also makes the writer's page send its draft again
  (ADR 0002), so someone who joins in the middle of a character still sees it.
- `spec/browser.test.ts` now waits for the second person's stream to carry
  their cookie, and failed without this change.
