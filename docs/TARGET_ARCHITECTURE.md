# Target Architecture

## Core principle

**Structured catalog data should become the source of truth.**

The frontend, chat assistant, community features, and future submission/review workflows should all consume the same structured catalog records.

The revamp should be a data architecture revamp first, not a visual rewrite.

## What should change

Today:

- the homepage is handwritten
- the backend parses `index.html` to discover shows
- review data lives separately in `podcast-data.json`
- the presence of a detail page file is part of the effective catalog state

Future:

- shows should be defined in data
- the homepage should render from that data
- filters should derive from that data
- detail pages should use a reusable template
- chat and community features should load the same data directly, not scrape HTML

## Proposed data-first structure

```txt
data/
  shows.json
  collections.json
  tags.json
  creators.json
  networks.json
  schema.md
```

This does not have to become a database-backed CMS immediately. Plain versioned JSON files are enough for the next stage if the schema is clean.

## Proposed application structure

```txt
/
  index.html
  show.html
  collections.html
  collection.html
  submit.html
  about.html
  script.js
  data/
  podcast-ai/
```

Suggested future routes:

```txt
/
  Homepage / Browse

/show.html?id=impact-winter
  Reusable show detail page

/collections.html
  Browse all collections

/collection.html?id=best-for-long-walks
  Reusable collection page

/submit.html
  Creator/listener show submission page

/about.html
  Platform explanation, curation policy, rating policy
```

## Frontend model

The existing visual language can remain.

What should change is the rendering model:

- homepage cards generated from `shows.json`
- quick filters derived from controlled tags
- collection cards driven by `collections.json`
- result counts generated from actual records
- show detail page populated by `id`

This keeps the aesthetic while removing manual duplication.

## Backend model

The backend should stop parsing HTML.

Instead, it should:

1. load structured catalog data directly
2. normalize and validate it
3. expose that data to chat/community logic
4. optionally sync derived slices into SQLite if needed

The SQLite database should remain a store for participation data, not the editorial source of truth.

## Relationship between static files and data

Near-term target:

- JSON files are the editorial source of truth
- the site remains largely static
- JS fetches or embeds the catalog data client-side
- Express keeps serving static files plus APIs

Later, if the archive grows large enough, the project can revisit whether a fuller application stack is necessary. That should be a later decision, not a prerequisite for fixing the current architecture.

## Show page strategy

Detail pages should move from handwritten standalone files to a reusable show template.

Good target behavior:

- `show.html?id=impact-winter`
- shared layout and components
- content blocks filled from structured data
- optional richer review fields for shows with full editorial coverage

This supports both:

- many indexed shows
- only some full reviews

That distinction matters. Inclusion in the archive should not require a full longform review.

## Collection strategy

Collections should become first-class structured objects rather than hardcoded homepage cards.

Examples:

- Best for long walks
- Shows like Derelict
- Shows like Midnight Burger
- Completed shows
- Serious sci-fi
- Funny space disasters
- Cold isolation horror
- Short shows under 5 hours

Collections can be:

- manually curated
- rule-backed
- hybrid

The right default is curated with light structural support.

## Ratings and editorial signals

The future UI should separate:

- Archive Rating
- Community Rating

Archive Rating is the editorial stance of the site.

Community Rating is useful social proof, but only after enough votes exist to mean anything.

## Submission and corrections

Submissions and corrections should connect to the catalog layer, not to a generic contact page.

That does not require a complex workflow immediately. It just means:

- the destination should be "submit a show" rather than "contact us"
- incoming data should map cleanly onto the show schema
- correction flows should preserve editorial control

## Maintainability rules for the target system

- one canonical show record per show
- one canonical collection record per collection
- controlled vocabularies for important filters
- shared slug/id rules
- no backend dependence on DOM scraping
- no requirement to hand-author a new HTML page per show

## What not to do yet

Avoid overbuilding the target stack too early:

- no immediate forced rewrite into a heavy framework
- no premature CMS migration
- no accounts-first rebuild
- no giant database schema before the catalog structure is proven

The next architecture should be boring, durable, and easy to extend.
