# Crit 9 reflection: All at once

## 1. What was the breakthrough that moved the work forward?

The breakthrough was separating what the room *sees* from what the scroll *keeps*. When I chose live ink, I was worried that it went against my own README: if people can watch you draft, they also see your mistakes, and I had promised the app would never judge handwriting. At first it felt like I had to pick one or the other. Then I realised the two could be split. Everyone watches the brush move, undos included, but only the character the writer decides to add is stored ([ADR 0002](../doc/adr/0002-live-ink.md)). That turned a vague worry into one clear rule ("never keep or replay a draft") that the server and the spec can both hold to.

## 2. What did this work change about who I want to be as a software developer?

This week made me more careful with numbers. One test said an update reached a slow connection in 14 ms, which was too good to be true, and it was. The throttling had not touched the stream at all. A green result or a fast number only means something if I know what was actually tested. I want to be a developer who asks "how could this number be wrong?" before putting it in a document.

I also want to keep making the product decisions myself. The agent laid out the options clearly, and I ended up choosing the one it recommended, but I am the one who has to defend it to my pod. So I needed to understand what each option would cost, not just which one was suggested.
