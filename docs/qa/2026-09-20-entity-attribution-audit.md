# Entity attribution audit — 2026-09-20

This pass used authored `catalog-src` records, the public entity registry, stored import metadata, and repository-held catalogue/source URLs. It performed no external lookups and created no entities.

## Source graph result

| Metric | Before | After |
| --- | ---: | ---: |
| Published shows | 752 | 752 |
| Public entities | 132 | 132 |
| Shows with typed entity links | 266 | 266 |
| Typed relationship records | 318 | 330 |
| Unique show/entity pairs | 318 | 318 |
| Zero-relationship shows | 486 | 486 |
| Non-infrastructure attribution gaps | 484 | 484 |

The 12 automatic additions are all exact, non-compound `credits.network` matches whose existing public entity has type `network`: 11 iHeartPodcasts show links and one Faustian Nonsense link. They add typed role records to already-linked show/entity pairs; they do not increase show coverage or create new entity identities.

## Review queue

The repeatable queue is emitted by:

```sh
npm run report:entity-attribution -- --json
```

After the deterministic links were applied, it contains 541 ranked items across 535 shows:

- 484 unresolved non-infrastructure show-attribution items;
- 28 existing-entity candidate items outside the automatic rules;
- 23 entity-type/role conflict items, including 19 exact non-compound conflicts from the typed-credit scan;
- 6 compound candidate items; and
- 2 infrastructure-only shows kept out of entity creation.

Every item carries a source path, candidate entity or unresolved raw value, proposed role where one is supported, source evidence, stored provenance/URLs, confidence, and a reason for review.

## Recurring patterns

- The main gap is legacy creator/creatorName attribution with no resolved public entity: 484 shows.
- `networkId` and network fields mix networks with provider, show, and slug-like labels: 198 shows.
- Compound credits affect 84 shows and require deliberate splitting.
- Structured author/creator people evidence lacks a matching public person entity on 27 unlinked shows.
- Provider labels recur as infrastructure: Buzzsprout (22 shows), RSS.com (20), ART19 (17), Spreaker (13), and Patreon (2). They remain excluded from entity creation.
- `BBC` is the only recurring non-infrastructure unresolved raw value in the current unlinked batch (2 shows: The Archers and The Cipher); it is a review/normalization lead, not an automatic entity proposal.

## Validation

Passed: `build:catalog`, `build:pages`, `validate:data` (0 errors), entity-attribution tests, entity graph tests, existing enrichment-candidate tests, generated-boundary check, structure check, internal-link check, and `git diff --check`.

The broader `npm run test:tools` run still has two environment-specific failures unrelated to this pass: GNU `stat` flags are unavailable on macOS, and one shell regression expects `/usr/bin/node`. No commit, push, or deployment was performed.
