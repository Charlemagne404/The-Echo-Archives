## Current task

Expand Ask the Archivist into a grounded site concierge that can answer Echo Archives site/help questions in addition to recommendation prompts.

## Files changed

- `podcast-ai/lib/chat-intents.js`
- `podcast-ai/lib/chat.js`
- `podcast-ai/lib/routes/chat-routes.js`
- `podcast-ai/lib/site-help-format.js`
- `podcast-ai/lib/site-help.js`
- `podcast-ai/server.js`
- `podcast-ai/test/browser.smoke.js`
- `podcast-ai/test/chat-intents.test.js`
- `podcast-ai/test/chat-routes.test.js`
- `podcast-ai/test/site-help.test.js`
- `shared/app/chat.js`
- `shared/app/constants.js`
- `shared/styles/home/cards.css`
- `HANDOFF.md`

## What was completed

- Added a deterministic site-help layer for Ask the Archivist with intent classification, grounded help answers, and structured action links.
- Extended `/api/chat` to accept page context and return optional `actions` alongside recommendation cards.
- Kept catalog recommendations intact while adding support for ratings, creator verification, submit/correction flows, privacy, terms, support, collections, archive-purpose, and bounded third-party platform questions.
- Updated the shared chat UI to send page context, render help action links, persist the richer chat history shape, and use broader site-concierge copy and starter prompts.
- Added backend coverage for intent routing, site-help answers, and chat API behavior, plus expanded the browser smoke flow for help prompts, action links, recommendation cards, submit-page help, and show-page trust questions.

## What still needs work

- No known follow-up from this implementation pass.

## Commands run

- `rtk npm test`
- `rtk node --test test/chat-intents.test.js`
- `rtk node --test test/site-help.test.js`
- `rtk node --test test/chat-routes.test.js`
- `rtk npm run test:smoke -- --test-name-pattern="Ask the Archivist and the remade submit page interactions work across modes"`
- `rtk git status --short`

## Known issues

- The repo already had unrelated pre-existing worktree changes outside this task. They were left untouched.
