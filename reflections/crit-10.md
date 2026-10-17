# Crit 10 reflection: Fly by instruments

## 1. What was the breakthrough that moved the work forward?

The breakthrough was testing the app like we would during the crit and checking the server logs. At first, the logs only showed Fly starting and stopping, so I could not tell what each user was doing. After adding logging, all API tests passed, but testing with two browsers showed that both users appeared as `user=-` when entering the room. This happened because the page connected before users entered their names and did not reconnect. I also found that new users could not join while someone else was writing. The API tests missed these problems. I added `spec/browser.test.ts` to test with two separate browsers, which helped me find and fix these issues ([ADR 0005](../doc/adr/0005-watch-as-yourself.md)).

## 2. What did this work change about who I want to be as a software developer?

I want to be a developer who makes sure my app is easy to test and debug. Before this week, I thought logs were mainly for finding errors. Now I understand that logs can also help explain what users are doing, especially when something goes wrong after deployment. I learned that useful logs should clearly show who did what, while keeping private data like tokens, strokes, and drafts out of them.

I also learned that multi-user support needs to work in both the frontend and backend. Even though the server rules were correct, a hidden form stopped the second user from joining. This reminded me to test the whole app from a real user's point of view.
