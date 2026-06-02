# Implementation Checklist

## Phase 0 - Audit and prep

- [x] Confirm all current indexed shows and assign stable ids
- [x] Inventory all current homepage card fields
- [x] Inventory all current `podcast-data.json` fields
- [x] List all live full review pages
- [x] Document broken or missing detail-page links
- [x] Document inconsistent folder, slug, and filename patterns
- [x] Decide initial controlled vocabularies for tags
- [x] Decide whether JSON-first static architecture is enough for the next milestone

## Phase 1 - Catalog source of truth

- [x] Create `data/`
- [x] Add `data/schema.md`
- [x] Add `data/shows.json`
- [x] Create one show record for every indexed show
- [x] Migrate the 3 detailed review entries into the new schema
- [x] Add `reviewStatus` for all shows
- [x] Add `completionStatus` and `releaseStatus` where known
- [x] Validate ids, links, and duplicate tags

## Phase 2 - Dynamic homepage

- [x] Add catalog-loading logic to the frontend
- [x] Render homepage cards from `shows.json`
- [x] Preserve current card visual design
- [x] Generate results count from data
- [x] Generate quick filters from controlled data where appropriate
- [x] Generate disabled or indexed-only state from `reviewStatus`
- [x] Confirm rendered output matches current homepage before removing manual cards

## Phase 3 - Collections

- [x] Add `data/collections.json`
- [x] Define collection schema
- [x] Migrate existing homepage collections into structured data
- [x] Add at least 6 meaningful discovery collections
- [x] Decide which collections are curated versus rule-backed
- [x] Create reusable collection rendering

## Phase 4 - Reusable show pages

- [x] Create `show.html`
- [x] Load show content by `id`
- [x] Migrate Impact Winter first
- [x] Confirm parity with the current static page
- [x] Migrate Ars Paradoxica
- [x] Migrate Oz 9
- [x] Decide how indexed-only shows should render before full reviews exist
- [x] Retire manual detail pages only after confirmation

## Phase 5 - Submit and trust

- [x] Create `submit.html`
- [x] Decide whether Tally remains the backend intake path
- [x] Create `about.html`
- [x] Add curation explanation
- [x] Add rating explanation
- [x] Add show count
- [x] Add full review count
- [x] Add last updated date

## Phase 6 - Community ratings

- [x] Separate archive rating from community rating in UI copy
- [x] Decide minimum vote threshold for visible community averages
- [x] Decide whether homepage cards show community signals
- [x] Add basic anti-spam or abuse controls
- [x] Preserve anonymous rating flow unless there is a strong reason to change it

## Phase 7 - Launch readiness

- [x] Improve SEO metadata
- [x] Add Open Graph metadata
- [x] Add sitemap
- [x] Add creator correction flow
- [ ] Verify mobile behavior across main pages
- [x] Verify chat behavior against the new catalog source
- [x] Verify community ratings against the new catalog source
- [ ] Prepare launch messaging and outreach list
