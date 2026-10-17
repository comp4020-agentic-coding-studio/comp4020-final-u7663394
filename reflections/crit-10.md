# Crit 10 reflection: Fly by instruments

## 1. What was the breakthrough that moved the work forward?

The breakthrough was reading the log the way I will at the crit, instead of only checking that tests passed. When I looked at the deployed log first, it only showed Fly starting and stopping the machine. Nobody could tell who did what. After adding logging, every API check was green, but when I ran the app in two separate browsers and read the server log, both people were `user=-` when they opened the room. The page connected before they chose a name and never reconnected. The same run showed a worse problem: someone who arrived while another person was writing had no way to join at all. The API was fine, so the tests could not see it. Now `spec/browser.test.ts` runs the crit with two browser contexts, and it failed before each fix ([ADR 0005](../doc/adr/0005-watch-as-yourself.md)).

## 2. What did this work change about who I want to be as a software developer?

I want to be a developer who builds the tools for checking my app before I need them. Before this week I thought of logs as something for errors. Now I see the log as a way to explain what the app did, to my pod, to a marker, or to the agent when something breaks after deploy. That changed what I put in it. Logging more was not the goal. It had to say who and what on every line, and it had to leave things out: tokens, strokes, and the drafts I promised are never kept.

I also learned that "multi-user" is not only about the server. The server rules were right, but one hidden form meant the second person could not even join.
