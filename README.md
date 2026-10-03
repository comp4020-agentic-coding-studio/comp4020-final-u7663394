# Calligraphy Relay 书法接力

A line of classical Chinese poetry, written one character at a time by
different people. You pick up the brush, write one character, and pass it on.
The finished scroll is kept, every writer's seal beside their character.

## What good means here

**Every hand stays visible in the scroll, and no scroll can be finished by one
hand.**

Most shared drawing toys are open canvases, and r/place showed what that
becomes at scale: communities fighting over territory. A relay is closer to the
Surrealists' exquisite corpse: a fixed order, a small part each, and a result
nobody could have made alone. Calligraphy adds the old idea that handwriting
shows the person, so the app's job is to keep each hand intact, not improve it.

The app is good when:

1. **The brush passes.** One person holds the brush at a time, and nobody
   writes two characters in a row.
2. **Ink is kept as drawn.** Strokes are stored as the points your hand made
   and drawn the same way on every screen. Nothing is scored, corrected or
   smoothed afterwards.
3. **Every character is signed** with a red seal bearing the name its writer
   had when they wrote it.
4. **The room sees it happen.** Everyone watching sees who holds the brush, and
   a new character appears on every open screen within a second.
5. **A stranger can join in ten seconds.** A name is the only sign-up. Pinyin,
   a translation and a faint model character mean you needn't read Chinese.
6. **It leaves a trace.** Finished scrolls stay in their room, and when you come
   back tomorrow you are still you.

## Who it's for

Small groups in one place: a workshop table, a class, a few friends, a showcase
crowd split into rooms (`/r/table-4`). This is Shirky's situated software,
built for a particular group rather than generic users, and Sloan's
home-cooked app, which never needs to scale.

## What it deliberately leaves out

No accounts, feeds, followers, likes, chat, scores or rankings: telephone games
like Gartic Phone already do drawing for laughs and points. No handwriting
recognition or grading, because an "ugly" character is still somebody's. No
free canvas and no choosing your own text: lines are short classical verse, so a
scroll takes minutes and nothing needs moderating.

## Which claims are checked, and which are judged

Claims 1--4 and 6 are enforced by checks in [`spec/`](spec/) that run against
the built app on every push: two people reaching for the brush at once, the
same person twice, malformed strokes, strokes returned exactly as sent, a
character reaching another session within a second, and everything surviving a
killed server. Claim 5, and whether mixed hands still read as one scroll, can
only be judged: by watching people who have never seen the app use it cold at
the crit, on a phone and a desktop side by side. What I see rewrites this page.
How it was built is in [`PROCESS.md`](PROCESS.md) and [`doc/adr/`](doc/adr/).

## Sources

- Wang Xizhi, *Preface to the Orchid Pavilion Poems* (353): forty-two literati
  gathered to compose poems. Every room's first scroll is its opening line.
  [Wikipedia](https://en.wikipedia.org/wiki/Lantingji_Xu)
- [r/place](https://en.wikipedia.org/wiki/R/place) (Reddit, 2017): what an open
  shared canvas turns into.
- [Exquisite corpse](https://www.moma.org/collection/terms/exquisite-corpse),
  MoMA glossary.
- Clay Shirky, [Situated Software](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html) (2004).
- Robin Sloan, [An app can be a home-cooked meal](https://www.robinsloan.com/notes/home-cooked-app/) (2020).
- Aaron Koblin, [The Sheep Market](https://www.aaronkoblin.com/project/the-sheep-market/):
  10,000 sheep by paid strangers, many hands that never meet.
- [Broken Picture Telephone](https://en.wikipedia.org/wiki/Broken_Picture_Telephone),
  the genre Gartic Phone belongs to.
- Steve Ruiz, [perfect-freehand](https://github.com/steveruizok/perfect-freehand),
  which draws the ink.
