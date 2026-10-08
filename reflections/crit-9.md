# Crit 9 reflection: All at once

## 1. What was the breakthrough that moved the work forward?

The breakthrough was separating what users *see* from what the scroll *keeps*. When I chose live ink, I worried that showing mistakes might go against my README's idea of never judging handwriting. Then I realised users could watch the drawing process, including undos, while only the final character would be saved ([ADR 0002](../doc/adr/0002-live-ink.md)). This gave me a clear rule: never save or replay unfinished strokes. I could then use this rule to guide the implementation and tests.

## 2. What did this work change about who I want to be as a software developer?

This week taught me to be more careful with test results. One test showed that an update reached a slow connection in just 14 ms, which seemed too fast. After checking, I found that the network delay had not affected the stream. I learned that passing tests and good numbers do not always mean everything works correctly. I want to be a developer who checks how tests are done and questions results that seem unusual.

I also learned that I should make my own decisions about the project. The agent gave me several options and recommended live ink, which I eventually chose. However, I still need to explain and defend my choice to my pod. This made me realise that I should understand the advantages and costs of each option before making a decision, even when I follow the agent's suggestion.
