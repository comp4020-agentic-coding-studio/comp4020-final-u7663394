# Crit 8 reflection: It's alive!

## 1. What was the breakthrough that moved the work forward?

The biggest breakthrough was deciding the "pass the brush" rule before writing the code. My original idea was that the artwork should depend on the whole group, but this was too general. The relay rule made this idea clear: only one person can draw at a time, and they need to pass the brush to another person. This gave the server a clear rule to enforce, and I could also test it in `spec/relay.test.ts`.

Another important moment was finding a problem that all my spec checks missed. The tests were green, but when I opened the app in two real browsers, I found that `/` was being downloaded as a file instead of showing the page. I wrote a failing check first and then fixed the problem ([`0ff6c2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394/commit/0ff6c2c)). This made me realise that passing automated tests does not always mean the app really works for a user.

## 2. What did this work change about who I want to be as a software developer?

This work made me want to be a developer who understands the system I build and can check the agent's work myself. When choosing the stack, I chose Vue and TypeScript because I can read and understand the code from the frontend to the server. LiveView could handle more things for me, but I wanted to understand what was happening in my own app.

I also became more careful about evidence. When I used sources, I checked that I could actually read and understand them before citing them. I want to keep this habit in future projects: understand important decisions, test the real user experience, and only make claims that I can support.
