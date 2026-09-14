# Collection candidate report

`npm run report:collection-candidates` generates a read-only developer report
for expanding the existing editorial collection routes. It reads the authored
catalog source and prints candidate evidence; it does not write collection
memberships, operational candidate rows, generated catalog output, or source
records.

Use `--json` for machine-readable output or `--limit N` to control the number
of candidates printed under each collection:

```sh
npm run report:collection-candidates
npm run report:collection-candidates -- --json
npm run report:collection-candidates -- --limit 12
```

The report reuses `shared/archive-similarity.js` for deterministic comparison
dimensions, `tools/lib/discovery-quality-report.js` for collection coverage and
catalog richness profiles, and the collection service's factual rule matcher
for rule-based routes. It uses only existing structured or explicitly curated
metadata: genres, formats, tones, tags, themes, best-for routes, discovery
profiles, completion/release state and structured length fields used by existing
similarity/rule utilities, explicit `similarTo` links,
typed entity links, and existing curated collection membership patterns.

Broad-genre-only matches are excluded from candidate lists. Similarity-based
matches also need at least two collection-relevant dimensions, including a
specific signal such as a theme, tag, best-for route, or typed entity unless an
existing curated relationship already supplies that evidence. Each surfaced
candidate separates strong, supporting, and weak/context evidence. The report
also includes low-membership collections, rich or connected shows without any
collection membership, poorly represented metadata areas, and only strongly
supported near-duplicate collection pairs. Near-duplicate output is a review
signal; it never merges or edits collections.
