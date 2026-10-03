# Calligraphy Relay (书法接力)

A line of classical Chinese poetry, written one character at a time by different people. You pick up the brush, write one character, and pass it on. The finished scroll is saved, with every writer's seal beside their character.

## What good means here

**Every person's writing stays visible in the scroll, and no scroll can be finished by one person.** 

Many shared drawing apps use an open canvas, and r/place showed what can happen at a large scale: different communities fight for space. A relay is closer to the Surrealists' exquisite corpse: people follow an order, each person adds a small part, and the final result is something nobody could make alone. Calligraphy also has the idea that handwriting can show the person behind it, so the app should keep each person's writing as it is instead of trying to improve it.

The app is good when:

1. **The brush passes.** Only one person can hold the brush at a time, and nobody can write two characters in a row.
2. **Ink is kept as drawn.** Strokes are stored as the points made by the user's hand and shown in the same way on every screen. Nothing is scored, corrected or smoothed afterwards.
3. **Every character is signed** with a red seal showing the name the writer used when they wrote it.
4. **The room sees it happen.** Everyone watching can see who holds the brush, and a new character appears on every open screen within a second.
5. **A stranger can join in ten seconds.** A name is the only sign-up needed. Pinyin, a translation and a faint model character mean that users do not need to know Chinese.
6. **It leaves a trace.** Finished scrolls stay in their room, and when you come back tomorrow, the app still remembers who you are.

## Who it's for

Small groups in one place: a workshop table, a class, a few friends, or a showcase crowd split into rooms (`/r/table-4`). This follows Shirky's idea of situated software, which is built for a particular group instead of general users. It is also similar to Sloan's home-cooked app, which only needs to work well for a small group and does not need to scale.

## What it deliberately leaves out

No accounts, feeds, followers, likes, chat, scores or rankings. Telephone games like Gartic Phone already use drawing for fun and points. There is no handwriting recognition or grading because an "ugly" character still belongs to somebody. There is also no free canvas or option to choose your own text. The app uses short lines of classical poetry, so one scroll can be finished in a few minutes and there is little need for moderation.

## Which claims are checked, and which are judged

Claims 1--4 and 6 are checked by tests in [`spec/`](spec/) that run against the built app on every push. They check cases such as two people trying to take the brush at the same time, the same person writing twice, malformed strokes, strokes being returned exactly as they were sent, a new character reaching another session within a second, and all the data surviving after the server is killed. Claim 5, and whether different people's writing can still look like one scroll, need to be judged by real users. I can test this by watching people who have never used the app before try it at the crit, with a phone and a desktop side by side. How it was built is in [`PROCESS.md`](PROCESS.md) and [`doc/adr/`](doc/adr/).

## Sources

- Wang Xizhi, *Preface to the Orchid Pavilion Poems* (353): forty-two literati gathered to compose poems. Every room's first scroll is its opening line.
  [Wikipedia](https://en.wikipedia.org/wiki/Lantingji_Xu)
- [r/place](https://en.wikipedia.org/wiki/R/place) (Reddit, 2017): what an open shared canvas turns into.
- [Exquisite corpse](https://www.moma.org/collection/terms/exquisite-corpse), MoMA glossary.
- Aaron Koblin, [The Sheep Market](https://www.aaronkoblin.com/project/the-sheep-market/): 10,000 sheep by paid strangers, many hands that never meet.
- Steve Ruiz, [perfect-freehand](https://github.com/steveruizok/perfect-freehand), which draws the ink.
