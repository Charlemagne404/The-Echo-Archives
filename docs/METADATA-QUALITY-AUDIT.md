# Catalogue metadata quality audit

The metadata audit is a read-only, deterministic review queue for the authored catalogue. It is intended to show where editorial or factual cleanup will improve discovery, recommendation quality, entity navigation, and catalogue trust. It does not edit records, build generated data, fetch external sources, or infer values into the catalogue.

Run it from the repository root:

```bash
npm run report:metadata-quality
npm run report:metadata-quality -- --limit 25
npm run report:metadata-quality -- --json > /tmp/echo-metadata-quality.json
```

The default scope is published shows in `catalog-src/`, with entities, collections, and the approved tag taxonomy read from their authored source files. Use `--all` when draft records should be included. Human output shows the highest-value queues first; JSON contains complete affected IDs, evidence, queue scores, coverage distributions, and per-record findings.

## What the audit checks

- Field coverage and lower-quartile sparsity for genres, themes, tones, formats, discovery tags, best-for routes, similar-show links, and typed entity relationships.
- Internal evidence that a field may be incomplete, such as source-backed genre signals, format language in the record's own content fields, and approved source tags.
- Generic, deprecated, unapproved, non-canonical, broad-only, duplicated, and cross-field-redundant metadata.
- Naming variants and value distributions, including unusually overused or singleton controlled values.
- Recommendation coverage across similar links, collection routes, listener-intent routes, distinctive facets, and similarity reasons.
- Entity-link gaps, exact legacy-to-registry matches, unresolved creator/network evidence, orphan entities, role/type conflicts, duplicate names, and incomplete public review trails.
- Collection membership/reference integrity, show-reason coverage, anchors, cover-show references, automation definitions, descriptions, and weak routes.
- Provider identity collisions, malformed or semantically misplaced URLs, local cover paths, missing alt text, and duplicate cover assets.
- Contradictory lifecycle, intensity, format, similarity, episode-count, and runtime combinations.

## How to read the ranking

Every queue has a severity and a deterministic priority score. Severity reflects the risk of leaving the condition unresolved; the score adds a bounded impact boost based on affected catalogue share and, for record-level findings, the strength of the evidence. Ties resolve by category, record ID, and finding ID so repeated runs are stable.

The report separates `actionable` findings from policy signals. `imported` records are factual-only until they go through editorial promotion, so missing tones, themes, best-for routes, and similarity links are reported as a promotion queue rather than treated as defects. Missing factual genres or formats, malformed URLs, provider collisions, and contradictory metadata remain actionable regardless of review status.

Inference findings are review leads only. They cite the exact fields already present in the record and recommend manual verification; the audit never copies raw source keywords, invents relationships, or mass-edits catalogue records.

The machine-readable report is suitable for a later maintainer queue or dated QA snapshot, but no report file is written by default. This keeps the command safe to run while other catalogue or generated-artifact work is in progress.
