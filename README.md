# Calligraphy Relay (书法接力)

A line of classical Chinese poetry, written one character at a time by different people. Pick up the brush, write one character, and pass it on. The scroll keeps each writer's seal beside their character.

## What good means here

**Every person's writing stays visible in the scroll, and no scroll can be finished by one person.** 

Open shared canvases turn into fights for space, as r/place showed. A relay is closer to the Surrealists' exquisite corpse: people take turns, each adds a small part, and nobody could make the result alone. In calligraphy, handwriting shows the person behind it, so the app keeps each hand as it is.

The app is good when:

1. **The brush passes.** Only one person holds the brush at a time, and nobody writes two characters in a row.
2. **Ink is kept as drawn, in the writer's own brush.** Strokes are stored as the points of the writer's hand, with the weight, wetness and speed they chose. Every screen draws them the same way; nothing is scored, corrected or moved.
3. **Every character is signed** with a red seal showing the name the writer used at the time.
4. **The room sees it happen.** Everyone watches the brush holder's strokes and brush changes live. A new character reaches every open screen within a second. Only the added character is kept, never the draft ([why](doc/adr/0002-live-ink.md)).
5. **A stranger can join in ten seconds.** A name is the only sign-up. Pinyin, a translation and a faint model mean nobody needs Chinese.
6. **It leaves a trace.** Finished scrolls stay in their room, and tomorrow the app still remembers who you are.
7. **What's yours stays yours.** A browser with a name is one person. The server checks every change against them: only you rename yourself or put down your brush, and nobody can change a written character. Its log says who did what, never their strokes ([why](doc/adr/0004-who-may-change-what.md)).

## Who it's for

Small groups in one place: a workshop table, a class, or a showcase crowd split into rooms (`/r/table-4`). It is Shirky's situated software and Sloan's home-cooked app, made for one group.

## What it deliberately leaves out

No accounts, feeds, followers, likes, chat, scores or rankings; Gartic Phone already draws for points. No recognition or grading: an "ugly" character still belongs to somebody. 墨 Ink, the brush I learned from, can also redraw strokes from a dataset; I left that out, or the scroll would show the dataset's hand ([why](doc/adr/0003-the-writers-brush.md)). No free canvas or own text: short classical lines finish fast and need no moderation.

## Which claims are checked, and which are judged

Claims 1–4, 6 and 7 are checked in [`spec/`](spec/) on every push: racing for the brush, writing twice, bad strokes or brushes refused, good ones returned exactly, live changes arriving within a second, drafts never stored, data surviving a killed server, nobody changing another's things, and two separate browsers joining from the URL. Claim 5, whether the ink looks like calligraphy, whether mixed hands read as one scroll, and whether being watched scares people off need real users: I watch first-timers at the crit, phone and desktop side by side. How it was built: [`PROCESS.md`](PROCESS.md) and [`doc/adr/`](doc/adr/).

## Sources

- Wang Xizhi, *Preface to the Orchid Pavilion Poems* (353), every room's first line.
  [Wikipedia](https://en.wikipedia.org/wiki/Lantingji_Xu)
- [r/place](https://en.wikipedia.org/wiki/R/place) (Reddit, 2017): an open canvas at scale.
- [Exquisite corpse](https://www.moma.org/collection/terms/exquisite-corpse), MoMA glossary.
- Aaron Koblin, [The Sheep Market](https://www.aaronkoblin.com/project/the-sheep-market/): 10,000 sheep by paid strangers who never meet.
- [墨 Ink](https://ink-inky.vercel.app/), a calligraphy brush engine; the drying ink, 飞白 streaks and three dials come from studying it.
