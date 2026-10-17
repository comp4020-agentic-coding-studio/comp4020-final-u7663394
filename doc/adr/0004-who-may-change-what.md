# 4. One browser, one person: who may change what, and what the log says

Date: 2026-10-18

## Status

Accepted. Writes down the identity the app has had since crit 8 (it was never
in a record) and adds the access rules and the log on top. Nothing in ADRs
0001--0003 is replaced.

## Context

Crit 10 asks for three things: the app tells people apart, the server decides
what each person may see and change, and I can say who did what from the
server's log alone while two classmates use the app from its URL, each in
their own Chrome profile.

The app has told people apart since crit 8. Choosing a name creates a visitor,
and a random token in a long-lived cookie says which visitor a browser is. But
when I checked it against the crit, three things were missing:

- Nothing was written down about who may change what. The rules were spread
  over `server/relay.ts`, and one had a hole: anyone with a name could "put
  down" someone else's brush. The server answered 204 and changed nothing, so
  nothing was lost, but a refusal that looks like a success is a lie in the
  log too.
- A written character couldn't be changed only because no endpoint did it.
  The database itself would let a bug, or a later endpoint, rewrite one.
- The log said almost nothing. On Fly the app printed "listening", "SIGINT:
  closing" and one line per character with a full visitor id. Nobody could
  narrate a crit from that.

## Options

**What counts as a person**

1. *A browser with a name* (kept from crit 8). Choosing a name for your seal
   creates you. The cookie (`HttpOnly`, `SameSite=Lax`, one year) holds a
   32-byte random token, and the database keeps only its SHA-256. Another
   Chrome profile is another person.
2. *Accounts with an email or password.* This would tie a person to a human
   across devices. But the README says a name is the only sign-up, and a
   stranger at a showcase table won't make an account to write one character.
3. *Everyone who opens the page, before choosing a name.* Watchers would get
   an identity in the log too, but every passer-by would become a row, and
   watching needs no rights anyway.

**What the log calls a person**

1. *An opaque id only*, like the week 10 lecture's example. Nothing personal
   in the log, but to narrate I'd have to remember which id is which person,
   and `flyctl logs` only shows recent lines, so the line that matched them up
   may already be gone.
2. *Their name only.* Easy to read out, but names aren't unique (two people can
   both be "Sam") and a rename changes it.
3. *A short id and the name on their seal* (chosen). `user=` is the first
   eight characters of the visitor id, which is what the server decides by.
   `as=` is the seal name. It is a name people choose to sign with in public,
   and it is already on every character they write, so the log knows nothing
   the room doesn't.

## Decision

**Who is a person.** A browser that has chosen a name. The name form is on
the room page whenever this browser has no name yet, including while someone
else holds the brush, so the URL is all a newcomer needs.

**Who may see what.** Everything in a room is public to anyone with its link:
the scroll, finished scrolls, who holds the brush, live ink, how many people
are here. A room is for a table, not a secret. The cookie is the only secret,
and only the browser that owns it ever has it. A visitor id is public (it comes
with every character) and is not a key to anything.

**Who may change what.** Always checked on the server, inside the transaction
that makes the change, against the person the cookie says. Never against a
name or an id sent in the request.

| What | Who may change it |
| --- | --- |
| your name | only you; a rename never re-signs characters already written |
| the brush | anyone with a name may pick up a free brush, except whoever wrote last; only its holder may put it down; after three minutes someone else may take it |
| live ink | only the brush holder, for the character they're on |
| a written character (points, brush, seal) | nobody, its writer included |
| a finished scroll | nobody |

- Putting down a brush you don't hold is refused with `not_your_brush`.
- Migration 3 adds two triggers so the database refuses any `UPDATE` or
  `DELETE` on `glyphs`, whatever the code above it does.
- A request without a valid cookie is nobody: it can watch, never write.
- Another website can't act as you. The cookie is `SameSite=Lax`, so the
  browser doesn't send it with another site's `POST`, and `fly.dev` is a public
  suffix, so even another Fly app counts as another site.

**What the log says.** One line per event on stdout, which Fly collects and
`flyctl logs` shows:

```
[3f9c1a] brush.take room=hall scroll=7 position=2 char=毕 user=1705195b as=Ada
[3f9c1a] POST /api/rooms/hall/brush 200 3ms user=1705195b as=Ada
[8b20d4] POST /api/rooms/hall/brush 409 2ms user=1705195b as=Ada error=pass_the_brush
```

- The tag is the request, so a request and what happened inside it read
  together. This is the shape from the week 10 lecture.
- Logged: joining and renaming, a room's stream opening and closing, the brush
  being picked up, put down or running out, a character being added (with its
  stroke and point counts and its brush), a scroll being finished, every
  refused request with its reason, and every server error with its request.
  Plain reads that worked (loading a room or a scroll) are not: they change
  nothing, and a room is reloaded after every reconnect.
- Never logged: the cookie or its token, stroke points, or accepted live ink.
  The README promises a draft is stored nowhere, and a log that keeps "Ada
  cleared her pad" for days is somewhere. Refused ink is logged, with who sent
  it.
- Anything a person can choose (a name, a URL) is quoted and escaped, so
  nobody can write a fake line into the log by picking a strange name or path.

## Consequences

- A person is a browser, not a human. Someone with two Chrome profiles is two
  people and could write two characters in a row under two names. I accept
  this: the app is for people in one place, both seals would sit next to each
  other on the scroll, and stopping it would need accounts, which the README
  leaves out.
- Clearing cookies or opening a new profile starts a new person. Characters
  already written keep their old seal.
- Two people can choose the same name. The scroll then shows the same seal
  twice, but the server and the log still tell them apart by id.
- A future migration that really has to change written characters must drop
  the triggers first, and that needs a new ADR.
- The log is now the first thing to read when the deployed app misbehaves:
  `mise exec -- flyctl logs -a comp4020-final-u7663394 --no-tail`. Fly only
  shows recent lines, so it is for debugging, not a history. The history is
  the database.
- Every change is logged twice, as an event and as its request line. That is
  wordy, but at a crit the request line shows refusals and the event shows
  what happened, and both carry the same tag. If a showcase room gets too
  noisy, the request lines of changes that worked are the first thing to drop.
