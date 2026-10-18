# Calligraphy Relay (书法接力)

A line of classical Chinese poetry, written one character at a time by different people, each signed with the writer's seal.

## What good means here

**Every person's writing stays visible in the scroll, and no scroll can be finished by one person.** 

Open canvases that keep everything turn into fights for space, as r/place showed. A relay is closer to the Surrealists' exquisite corpse: people take turns, and nobody could make the result alone. Handwriting shows the person behind it, so the app keeps each hand as it is.

The app is good when:

1. **The brush passes.** Only one person holds the brush at a time, and nobody writes two characters in a row.
2. **Ink is kept as drawn, in the writer's own brush.** Strokes are stored as the points of the hand, with the weight, wetness and speed chosen. Nothing is scored, corrected or moved.
3. **Every character is signed** with a red seal showing the name the writer used at the time.
4. **The room sees it happen.** Everyone watches the brush holder's strokes live, and a new character reaches every screen within a second. Only the added character is kept ([why](doc/adr/0002-live-ink.md)).
5. **A stranger can join in ten seconds.** A name is the only sign-up. Pinyin, a translation and a faint model mean nobody needs Chinese.
6. **It leaves a trace.** Finished scrolls stay in their room, and tomorrow it still remembers you.
7. **What's yours stays yours.** A browser with a name is one person. The server checks every change: only you rename yourself or put down your brush, and nobody changes a written character. Its log says who did what, never their strokes ([why](doc/adr/0004-who-may-change-what.md)).
8. **Waiting is writing too.** While one person holds the brush, everyone can practise the line together on the room's water cloth, like park calligraphers writing in water (地书). Strokes are signed while wet and dry within ninety seconds: nothing to keep or fight over ([why](doc/adr/0006-the-water-cloth.md)).

## Who it's for

Small groups in one place: a workshop table, a class, or a showcase crowd split into rooms (`/r/table-4`). It is Shirky's situated software and Sloan's home-cooked app.

## What it deliberately leaves out

No accounts, feeds, likes, chat, scores or rankings; Gartic Phone already draws for points. No grading: an "ugly" character still belongs to somebody. 墨 Ink, the brush I learned from, can also redraw strokes from a dataset; I left that out, or the scroll would show the dataset's hand ([why](doc/adr/0003-the-writers-brush.md)). No canvas that keeps free drawing, and no own text: the water cloth dries, and classical lines need no moderation.

## Which claims are checked, and which are judged

Claims 1–4 and 6–8 are checked in [`spec/`](spec/) on every push: racing for the brush, bad strokes refused, good ones returned exactly, live changes within a second, drafts never stored, data surviving a killed server, nobody changing another's things, cloth strokes drying, and two browsers joining from the URL. Claim 5, whether the ink looks like calligraphy, mixed hands read as one scroll, or being watched scares people off need real users: I watch first-timers at the crit. How it was built: [`PROCESS.md`](PROCESS.md), [`doc/adr/`](doc/adr/).

## Sources

- Wang Xizhi, [*Preface to the Orchid Pavilion Poems*](https://en.wikipedia.org/wiki/Lantingji_Xu) (353), every room's first line.
- [r/place](https://en.wikipedia.org/wiki/R/place) (Reddit, 2017): an open canvas at scale.
- Laura Vermeeren, [Ephemeral water calligraphy](https://doi.org/10.1080/09502386.2021.2011934), *Cultural Studies* 36(5), 2022: 地书 in Beijing's parks.
- [Exquisite corpse](https://www.moma.org/collection/terms/exquisite-corpse) (MoMA).
- [墨 Ink](https://ink-inky.vercel.app/), a calligraphy brush engine; the drying ink, 飞白 and three dials come from it.
