# Creator data audit — 2026-09-08

## Scope and method

This audit covers the authored split catalog in `catalog-src/shows/` and
`catalog-src/entities.json`. It checked all 752 published show records,
normalized entity names and aliases, creator/credit consistency, typed
`entityLinks`, legacy `creatorId`/`networkId` fields, malformed creator-bearing
values, and source-backed company/person relationships. Publisher and official
company/show pages were used for high-confidence additions. Ambiguous names,
compound credits, and ownership-only evidence were left unresolved.

## Current inventory

- 101 public entities: 52 production companies, 12 networks, 5 studios, and
  32 people.
- 278 explicit show/entity relationships across 228 published shows.
- 48 organization entities are directory-visible; people and one-show
  organizations remain available on show/detail surfaces without being made
  into directory cards.
- 62 entities meet the current two-show indexability threshold. Every curated
  entity has at least one published relationship.
- No organization is linked with the `creator` role; people use `creator`, and
  organizations use `production-company`, `studio`, or `network`.
- The final normalized scan found zero cross-entity name/alias collisions,
  unknown or duplicate relationship triples, person-role violations, or
  malformed URL/email creator values.

## Corrections and coverage improvements

- Kept Fool & Scholar Productions, K.A. Statz, and Travis Vengroff as three
  distinct entities. The White Vault and Vast Horizon now expose the company
  as production company and the two people as creators; no alias makes those
  identities equivalent.
- Removed redundant same-entity aliases from Fool & Scholar, Fable & Folly,
  SpectreVision Radio, and Shadow & Static Productions.
- Split or typed high-confidence credits for companies, networks, studios,
  and people across the major catalog lanes, including Dead Signals, Hanging
  Sloth Studios, Alternative Stories, Gideon Media, Audible Originals, Realm,
  Rusty Quill, WNYC Studios, Pale Matter Productions, the Sonar Network,
  FinalRune, and other source-backed records.
- Added Storyglass as a production company. Max Olesker and Ivan Gonzalez are
  separate creator entities for Max & Ivan: Fugitives; Mark Healy is a separate
  creator entity for The Harrowing. Mark Healy was not merged with the existing
  Mark R. Healy entity.
- Corrected creator/production modeling for records including The Dead Letters
  Podcast, Derelict, Midnight Burger, We’re Alive, Desert Skies, Earth Eclipsed,
  EOS 10, Solar, and The Phenomenon. Hosting labels such as ART19, Buzzsprout,
  RSS.com, Spreaker, and Spotify remain infrastructure metadata.
- Removed malformed creator-bearing values such as email addresses, URLs,
  placeholder labels, lower-case handle-like values, and the incorrect
  show-title/network credit on Hello from the Magic Tavern. Corrected known
  display-name errors such as Maybell Marten and canonicalized Rusty Quill.
- Retained compound labels such as Marvel & Realm and Observer Pictures |
  Realm where the raw source still presents a joint credit. Observer Pictures
  and Realm now have separate typed links; Marvel was not invented as a new
  entity without a sufficiently clear relationship in the available sources.

## Deliberately unresolved

- Escape Pod still has a company-plus-`Mat` creator mismatch, and Passenger
  List still has John Scott Dryden alongside a Passenger List/Radiotopia
  credit. The available evidence does not establish the missing identity or
  role, so neither was inferred.
- Compound source labels remain on a bounded set of imported records,
  including joint companies/networks and co-branded credits. They are retained
  for provenance rather than being split into speculative entities.
- 552 published records still carry legacy `creatorId` values that do not
  match one of the 539 distinct ids in the curated registry. These are a
  migration queue, not proof that each record is wrong; the explicit typed
  relationship layer is authoritative for records already audited.
- Ownership fields are not treated as creator evidence. For example, a named
  owner on Primordial Deep does not create a Jordan Cobb creator relationship
  without a creator credit.

## Verification

Passed:

- `npm run build:catalog` and `npm run build:pages`
- `npm run validate:data` — zero catalog-integrity errors across 752 shows,
  46 collections, 101 entities, and 7 review companions
- `npm --prefix backend run test:catalog-integrity` — 5 passed
- `npm --prefix backend run check:links`
- `npm run test:tools` — 55 passed, 3 skipped because Restic is unavailable
- `npm --prefix backend test` — 316 passed
- `npm --prefix backend run test:smoke`
- source/derived consistency audit — 101 creator pages, 752 show/search-index
  records, 62 sitemap creator routes, and all 278 source relationships matched
- `git diff --check`

`npm run check:structure` still reports the pre-existing line-budget
violations, including `shared/styles/home/entity-detail.css` at 624 lines
against its 550-line hard limit. No typecheck or lint script is defined in the
root or backend package manifests.

No commit, push, deployment, production modification, or generated-page
changes outside the normal rebuild was performed.
