# Calligraphy Relay (书法接力)

A line of classical Chinese poetry, written one character at a time by different people. Pick up the brush, write one character, and pass it on. The finished scroll keeps each writer's seal beside their character.

## What good means here

**Every person's writing stays visible in the scroll, and no scroll can be finished by one person.** 

Open shared canvases turn into fights for space, as r/place showed. A relay is closer to the Surrealists' exquisite corpse: people take turns, each adds a small part, and the result is something nobody could make alone. In calligraphy, handwriting shows the person behind it, so the app keeps each hand as it is.

The app is good when:

1. **The brush passes.** Only one person holds the brush at a time, and nobody writes two characters in a row.
2. **Ink is kept as drawn, in the writer's own brush.** Strokes are stored as the points of the writer's hand, with the weight, wetness and speed they chose for the brush. Every screen draws the same points with the same brush; nothing is scored, corrected or moved afterwards.
3. **Every character is signed** with a red seal showing the name the writer used at the time.
4. **The room sees it happen.** Everyone sees who holds the brush and watches their strokes and brush changes live. A new character reaches every open screen within a second. Only the added character is kept, never the draft ([why](doc/adr/0002-live-ink.md)).
5. **A stranger can join in ten seconds.** A name is the only sign-up. Pinyin, a translation and a faint model character mean nobody needs to know Chinese.
6. **It leaves a trace.** Finished scrolls stay in their room, and tomorrow the app still remembers who you are.

## Who it's for

Small groups in one place: a workshop table, a class, or a showcase crowd split into rooms (`/r/table-4`). It is Shirky's situated software, built for a particular group, and Sloan's home-cooked app, which only has to work for a few people.

## What it deliberately leaves out

No accounts, feeds, followers, likes, chat, scores or rankings; Gartic Phone already draws for points. No recognition or grading: an "ugly" character still belongs to somebody. 墨 Ink, the brush I learned from, can also redraw strokes from a dataset; I left that out, or the scroll would show the dataset's hand ([why](doc/adr/0003-the-writers-brush.md)). No free canvas or own text: short classical lines finish in minutes and need little moderation.

## Which claims are checked, and which are judged

Claims 1–4 and 6 are checked in [`spec/`](spec/) against the built app on every push: racing for the brush, writing twice, malformed strokes or brush settings refused, good ones returned exactly as sent, live changes reaching another session within a second, drafts never stored, and data surviving a killed server. Claim 5, whether the ink looks like calligraphy, whether different hands read as one scroll, and whether being watched scares people off need real users: I watch first-time users at the crit, on a phone and a desktop side by side. How it was built: [`PROCESS.md`](PROCESS.md) and [`doc/adr/`](doc/adr/).

## Sources

- Wang Xizhi, *Preface to the Orchid Pavilion Poems* (353), every room's first line.
  [Wikipedia](https://en.wikipedia.org/wiki/Lantingji_Xu)
- [r/place](https://en.wikipedia.org/wiki/R/place) (Reddit, 2017): an open canvas at scale.
- [Exquisite corpse](https://www.moma.org/collection/terms/exquisite-corpse), MoMA glossary.
- Aaron Koblin, [The Sheep Market](https://www.aaronkoblin.com/project/the-sheep-market/): 10,000 sheep by paid strangers who never meet.
- [墨 Ink](https://ink-inky.vercel.app/), a calligraphy brush engine; the drying ink, 飞白 streaks and three dials come from studying it.
