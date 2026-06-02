# Implementation Checklist

## Phase 0 - Audit and prep

- [ ] Confirm all current indexed shows and assign stable ids
- [ ] Inventory all current homepage card fields
- [ ] Inventory all current `podcast-data.json` fields
- [ ] List all live full review pages
- [ ] Document broken or missing detail-page links
- [ ] Document inconsistent folder, slug, and filename patterns
- [ ] Decide initial controlled vocabularies for tags
- [ ] Decide whether JSON-first static architecture is enough for the next milestone

## Phase 1 - Catalog source of truth

- [ ] Create `data/`
- [ ] Add `data/schema.md`
- [ ] Add `data/shows.json`
- [ ] Create one show record for every indexed show
- [ ] Migrate the 3 detailed review entries into the new schema
- [ ] Add `reviewStatus` for all shows
- [ ] Add `completionStatus` and `releaseStatus` where known
- [ ] Validate ids, links, and duplicate tags

## Phase 2 - Dynamic homepage

- [ ] Add catalog-loading logic to the frontend
- [ ] Render homepage cards from `shows.json`
- [ ] Preserve current card visual design
- [ ] Generate results count from data
- [ ] Generate quick filters from controlled data where appropriate
- [ ] Generate disabled or indexed-only state from `reviewStatus`
- [ ] Confirm rendered output matches current homepage before removing manual cards

## Phase 3 - Collections

- [ ] Add `data/collections.json`
- [ ] Define collection schema
- [ ] Migrate existing homepage collections into structured data
- [ ] Add at least 6 meaningful discovery collections
- [ ] Decide which collections are curated versus rule-backed
- [ ] Create reusable collection rendering

## Phase 4 - Reusable show pages

- [ ] Create `show.html`
- [ ] Load show content by `id`
- [ ] Migrate Impact Winter first
- [ ] Confirm parity with the current static page
- [ ] Migrate Ars Paradoxica
- [ ] Migrate Oz 9
- [ ] Decide how indexed-only shows should render before full reviews exist
- [ ] Retire manual detail pages only after confirmation

## Phase 5 - Submit and trust

- [ ] Create `submit.html`
- [ ] Decide whether Tally remains the backend intake path
- [ ] Create `about.html`
- [ ] Add curation explanation
- [ ] Add rating explanation
- [ ] Add show count
- [ ] Add full review count
- [ ] Add last updated date

## Phase 6 - Community ratings

- [ ] Separate archive rating from community rating in UI copy
- [ ] Decide minimum vote threshold for visible community averages
- [ ] Decide whether homepage cards show community signals
- [ ] Add basic anti-spam or abuse controls
- [ ] Preserve anonymous rating flow unless there is a strong reason to change it

## Phase 7 - Launch readiness

- [ ] Improve SEO metadata
- [ ] Add Open Graph metadata
- [ ] Add sitemap
- [ ] Add creator correction flow
- [ ] Verify mobile behavior across main pages
- [ ] Verify chat behavior against the new catalog source
- [ ] Verify community ratings against the new catalog source
- [ ] Prepare launch messaging and outreach list
