# Discovery Enrichment Workflow

`tools/enrich-discovery.js` is a maintainer/developer CLI for manually adding
listener-facing discovery context to one existing show at a time. It is not a
public route, an importer, or a bulk enrichment job.

## Source and priority rules

The command reads the authored catalog from `catalog-src/`. The next-show queue
comes directly from
`buildDiscoveryQualityReport(...).enrichmentPriorities.candidateIds`, so it
uses the same eligibility rules, opportunity weights, and tie-breaking as the
discovery-quality report. Imported records remain outside the queue and are
refused even when selected by id.

The command edits only the selected show source record. It does not rebuild
`data/`, pages, search indexes, or deployment artifacts. Review the source
diff, then run the normal catalog build separately when the curation is ready
to enter generated output.

## Inspect the queue and a show

```sh
npm run catalog:enrich:discovery -- --list 10
npm run catalog:enrich:discovery -- --next
npm run catalog:enrich:discovery -- --id derelict
```

The show view includes the current discovery profile, missing editable fields,
description, genres, formats, creators and typed entities, runtime and
lifecycle facts, collections, outgoing/incoming similarity relationships, and
read-only candidates from the existing similarity index. Similarity candidates
are never written automatically.

## Dry-run and argument-driven editing

Argument edits are a dry run unless `--write` is supplied. Use `--set
FIELD=VALUE` for repeatable fields or the readable shortcuts below:

```sh
npm run catalog:enrich:discovery -- --id SHOW_ID \
  --voice-style primarily-acted \
  --narrative-focus balanced \
  --intensity medium \
  --commitment short \
  --tones dark,cinematic \
  --themes survival,found-family \
  --best-for headphones-on,long-walks
```

The equivalent generic form is:

```sh
npm run catalog:enrich:discovery -- --id SHOW_ID \
  --set discovery.voiceStyle=primarily-acted \
  --set discovery.narrativeFocus=balanced \
  --set discovery.intensity=medium \
  --set discovery.commitment=short \
  --set tones=dark,cinematic \
  --set themes=survival,found-family \
  --set bestFor=headphones-on,long-walks
```

The CLI prints a field-level diff before any write. To persist the change, use
`--write`; in a non-interactive shell also use `--yes`:

```sh
npm run catalog:enrich:discovery -- --id SHOW_ID \
  --set discovery.intensity=medium \
  --write --yes
```

List fields replace the selected field as a whole. Use `--clear FIELD` to
remove a field intentionally. Blank optional discovery values are treated as
absent; leaving a prompt blank keeps the existing value.

Similarity relationships require an explicit reason for every target. They
can be supplied as repeatable `SHOW_ID=REASON` arguments:

```sh
npm run catalog:enrich:discovery -- --id SHOW_ID \
  --similar=other-show="A deliberate adjacent route for the same listener" \
  --write
```

Use `--set similarTo=...` when intentionally replacing the complete outgoing
relationship list; every final target still needs a matching
`similarReasons.SHOW_ID` value. Use `--clear similarTo` to remove all outgoing
similarity links.

The target must be another published show. The command validates target ids,
self-links, duplicate values, and missing reasons before writing.

## Interactive editing and skipping

```sh
npm run catalog:enrich:discovery -- --next --interactive --write
```

Interactive mode shows the same context and asks only for currently missing
editable fields. `--all-fields` also prompts for populated fields so a
maintainer can revise them. Enter `-` to clear a field. At the selection
prompt, `--skip` (or the interactive skip action) leaves the show untouched;
skips are intentionally session-only and are not a second queue or persisted
workflow state.

## Controlled values

The four `discovery.*` fields use the controlled values defined in
`tools/lib/catalog-schema.js` and `data/schema.md`. `tones` and `bestFor` use
the archive's preferred vocabularies. `themes` remains a curated free-text
list, so the tool validates non-empty, non-duplicate values but does not
pretend that themes have a complete taxonomy.

`warm-weird` is also accepted for compatibility with existing authored
`bestFor` values.

The CLI never maps genres, formats, runtime, legacy `content.intensity`, RSS
keywords, embeddings, or similarity scores into subjective values. Existing
factual context is displayed to support a human decision; the human must
provide the final curation.
