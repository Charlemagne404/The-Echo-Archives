# Current Architecture

## Summary

The current project is a mostly static website with a small Node/Express service in `podcast-ai/` that serves three roles:

- same-origin archive chat API
- anonymous community ratings API
- optional static file server for the frontend

The frontend already has a strong visual direction. The main architectural weakness is that catalog data is duplicated across handwritten HTML and JSON, with the backend reading the HTML as an input source.

## Static frontend

The site root is a static frontend built from:

- `index.html`
- `script.js`
- `style.css`
- `home.css`
- `detail.css`

Assets live in show-specific folders plus `images/`.

The root homepage is fully handwritten HTML. It is not rendered from structured catalog data at runtime.

## Homepage

`index.html` contains:

- brand header and nav
- hero copy
- search field
- dropdown tag filters
- quick genre chips
- a hardcoded grid of podcast cards
- three hardcoded collection cards
- chat drawer UI
- Continental-branded footer

The page already communicates the right product direction, especially the headline "Find your next audio obsession."

## Podcast cards

The homepage currently hardcodes **27** podcast cards directly in HTML.

Each card contains:

- title
- href
- image path
- visible tags
- visible editorial rating
- `data-tags` metadata

Only **3** linked detail pages actually exist right now:

- `Impact Winter/impact-winter.html`
- `ars paradoxica/ars-paradoxica.html`
- `oz9/oz9.html`

The remaining **24** indexed shows are browseable in the grid but do not have real detail pages yet.

Indexed shows today:

- Solar
- Story
- From Now
- The Deca Tapes
- Earth Eclipsed
- Vast Horizon
- How I Died
- Windfall
- The Waystation
- We're Alive
- Impact Winter
- Oz 9
- Ars Paradoxica
- Red Valley
- The White Vault
- EOS 10
- Desert Skies
- Wolf 359
- Station 151
- Midnight Burger
- Spectre
- The Phenomenon
- Paralyzed
- Derelict
- Crystal Blues
- End of all Hope
- Tower 4

## Detail pages

There are currently 3 static show pages:

- `Impact Winter/impact-winter.html`
- `ars paradoxica/ars-paradoxica.html`
- `oz9/oz9.html`

These pages reuse the shared header, footer, chat drawer, and JS bundle, but their page bodies are manually authored. They are not generated from a shared show template.

The current detail page structure is much cleaner than the older one-off inline-style approach, but it is still duplicated page-by-page.

## `podcast-data.json`

`podcast-data.json` currently stores detailed review data for **3** shows:

- Impact Winter
- Ars Paradoxica
- OZ 9

Each entry contains fields such as:

- title
- category ratings
- final rating
- tags
- length
- structure
- narrator
- ads
- would re-listen
- favorite episodes
- quote
- summary
- thoughts
- best-for
- similar-to

This file contains richer catalog information than the homepage cards, but only for a small subset of the indexed shows.

## `script.js`

`script.js` handles most interactive behavior:

- homepage search and filtering
- quick filter chips
- hiding links for cards without live review pages
- results count updates
- collection filter buttons
- chat drawer open/close, persistence, suggestions, and API calls
- detail-page episode season switching
- back-to-top button
- community rating UI for detail pages

Important current behavior:

- The homepage uses a hardcoded `liveReviewPaths` set to decide which cards stay clickable.
- Cards without live reviews have their `href` removed in the browser and become disabled.
- Search/filter behavior works only against DOM content already present on the page.

There is also code for homepage community-rating widgets on archive cards, but it is not currently wired into the homepage initialization flow. The visible homepage ratings are still hardcoded editorial values from the HTML cards.

## Filters and search

Search and filters are entirely client-side.

Current inputs are handwritten in HTML:

- search input
- filter dropdown buttons
- quick filter buttons
- three collection cards

Current filter tags are not generated from a controlled vocabulary or shared data model. They are maintained manually in the markup.

## Community ratings

Community ratings exist as a real backend-backed feature.

Frontend behavior:

- detail pages mount a community rating panel dynamically
- users can rate from 1 to 10
- users can clear their rating
- profile identity is anonymous and persisted in `localStorage`

Backend behavior:

- ratings are keyed by `podcastId`
- rating summaries include average, count, user rating, and distribution
- submissions are tracked as upserts per anonymous profile
- rating events are stored separately for history

This is a meaningful feature already, but it still depends on the current catalog loading approach.

## Chat assistant

The site includes a shared "Ask the archive" chat drawer.

Frontend:

- stores chat history in `localStorage`
- calls `/api/chat/health`
- sends prompts to `/api/chat`
- shows suggested follow-up prompts

Backend:

- ranks catalog matches using simple heuristic scoring
- optionally sends a grounded prompt to Ollama
- falls back to deterministic recommendation text when Ollama is unavailable or the query is vague

Important constraint:

The assistant can only recommend from the locally loaded archive catalog. That is good. The issue is that the catalog source is still partially derived from HTML.

## `podcast-ai/` backend

`podcast-ai/server.js` boots the Express app.

Current API surface:

- `GET /api/health`
- `GET /api/chat/health`
- `POST /api/chat`
- `POST /api/community/profiles/anonymous`
- `GET /api/community/ratings/summary`
- `PUT /api/community/podcasts/:podcastId/rating`
- `DELETE /api/community/podcasts/:podcastId/rating`

If `SERVE_STATIC` is enabled, the same Express process also serves the static site from the repo root.

## Catalog loading

This is the biggest architectural note in the current system.

`podcast-ai/lib/catalog.js` does the following:

1. reads `index.html`
2. parses podcast cards out of the homepage HTML with regex
3. reads `podcast-data.json`
4. merges the JSON detail data onto the parsed homepage card records
5. checks whether the card href points to an existing page
6. builds a derived catalog used by chat and community features

That means the current source of truth is effectively split across:

- homepage HTML
- `podcast-data.json`
- the presence or absence of actual detail page files

This is acceptable for the current version, but it is not scalable or safe for a larger archive.

## SQLite database

The backend uses SQLite via `better-sqlite3`.

Current tables:

- `podcasts`
- `community_profiles`
- `rating_submissions`
- `rating_events`

Catalog entries are synced into the `podcasts` table from the merged in-memory catalog on service startup.

The database is therefore not the canonical catalog source. It is currently a supporting store for community features.

## Submit/contact flow

[`contact.html`](/Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/contact.html) is a thin wrapper around an embedded Tally form.

This works as a low-friction submit/contact flow for now, but it is generic rather than catalog-specific.

## Deployment assumptions

Deployment details are discoverable in `deploy/`:

- `deploy/Caddyfile.echo` reverse-proxies `echo.continental-hub.com` to `127.0.0.1:3010`
- `deploy/echo-archives.service` runs the Node service under systemd

Operational assumptions:

- Node 20+
- Express server handles both API and static files
- optional Ollama service on `127.0.0.1:11434`
- SQLite database file at `podcast-ai/data/community.sqlite` in production

## Current architecture problems

The main issues are structural, not visual:

- catalog data is duplicated between homepage HTML and `podcast-data.json`
- backend catalog loading depends on parsing handwritten markup
- most indexed shows do not have reusable detail pages
- slugs and paths are inconsistent across folders, filenames, and titles
- filters and collections are maintained manually in markup
- homepage rendering does not scale cleanly beyond a small handcrafted catalog

The current build proves the concept. It is not yet set up to grow into a real archive.
