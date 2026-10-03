# Calligraphy Relay

## Idea

My final project will be a multiplayer calligraphy website called **Calligraphy Relay**.

The main idea is simple: several people work together to complete one piece of Chinese calligraphy. A poem, sentence, or short passage is divided into individual Chinese characters. Each participant writes one character, then the next character is passed to another participant. Step by step, the group completes a full digital calligraphy scroll together.

For example, if the text is:

> 海内存知己，天涯若比邻

one person may write `海`, another person writes `内`, and someone else writes `存`. Each character keeps the style of the person who wrote it, so the finished scroll becomes a mixture of different handwriting styles.

No single participant creates the whole artwork. The final result only exists because several people contribute to it.

## Who It Is For

The app is designed for small groups of people who are interested in Chinese calligraphy, handwriting, Chinese culture, or simple creative collaboration.

It should also work well in a classroom, workshop, exhibition, or showcase where several people are using the website at the same time.

Users do not need to create a full account. When joining, they can choose a pseudonym. The app will also keep an internal visitor ID so it can tell different participants apart.

## Core Experience

A user enters a shared calligraphy room and sees the current scroll.

The page shows:

1. The full text that the group is trying to complete.
2. The characters that have already been written.
3. The character that is currently waiting to be written.
4. Who is currently writing.
5. How many people are in the room.

When it is a user's turn, they receive one Chinese character and write it on a digital canvas.

After they submit it, the character appears immediately on the shared scroll. Everyone else in the room sees the new character without refreshing the page.

The next character is then passed to another participant.

When the full sentence or poem is finished, the scroll becomes a completed collaborative artwork and is saved in the archive.

## Multi User

The project is designed around several people using the same shared state.

Different users can join the same room with different pseudonyms. The system records which person created each character.

A finished scroll can therefore show information such as:

> 海 by Bamboo  
> 内 by InkFox  
> 存 by Mountain

The identity system should stay lightweight because the main focus is shared creation.

## Real Time

Real time interaction is important because participants should feel that they are creating the scroll together.

When one person submits a character, every open browser in the same room should display it within about one second.

The interface can also show small live updates such as:

> Amy is writing 春

or:

> 4 people are currently in this room

This should make the room feel active even when a user is waiting for their turn.

## Persistence

Completed characters and scrolls will be stored in the database.

If everyone closes the website and returns later, the current scroll should still exist.

Completed scrolls will also remain in an archive where visitors can reopen them and see:

1. The original text.
2. The final collaborative scroll.
3. The contributors.
4. The character written by each person.
5. The completion date.

This means the history of the group activity becomes part of the application.

## What Good Means

My first definition of good is:

> **A good collaborative calligraphy experience should make every person's contribution visible while making the final artwork depend on the group.**

I want the project to feel different from a normal drawing canvas where everyone can draw anything anywhere.

Calligraphy Relay has a clear shared goal. Each person contributes only a small part, but every contribution remains visible in the final result.

A good version of the app should therefore:

1. Make it easy for a new visitor to understand what to do.
2. Make other people's presence visible.
3. Show new contributions quickly.
4. Preserve the individual style of each writer.
5. Keep the final scroll readable even when handwriting styles are very different.
6. Make the completed artwork feel owned by the whole group.
7. Keep completed scrolls so that the group leaves a visible trace behind.

## What I Do Not Plan to Build

I do not currently plan to add a complex account system, followers, private messages, public social feeds, scores, rankings, or competitive leaderboards.

These features would add complexity without improving the main experience of writing a scroll together.

I also do not want the app to judge whether someone's handwriting is good or bad. The differences between people's handwriting are part of the final artwork.

## Visual Direction

The visual design will be inspired by traditional Chinese calligraphy.

The main interface could use:

1. A horizontal Chinese scroll layout.
2. A light rice paper texture.
3. Black ink style strokes.
4. Red seals to represent contributors.
5. A simple traditional colour palette.
6. Smooth animation when a new character is added to the scroll.

The visual design should support the collaborative experience and keep the calligraphy itself as the main focus.

## Possible Technical Direction

The application will use a server backed database as the source of truth.

The database may store rooms, participants, scrolls, characters, stroke data, authors, and timestamps.

For real time updates, I will consider WebSockets or Server Sent Events.

Stroke data could be stored as drawing points rather than only as final images. This would make it possible to replay how someone wrote a character later.

The exact stack will be decided after comparing several options based on the limits of one small Fly.io machine, persistent storage, real time communication, and development complexity.
