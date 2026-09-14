# Entity enrichment candidate workflow

The authored entity graph is deliberately curated. `entityLinks` in
`catalog-src/shows/` remain the only source of public show/entity
relationships. The candidate workflow is a read-only review aid; it never
writes show records, entity records, or relationship data.

## Run the candidate report

From the repository root:

```bash
npm run report:entity-candidates
npm run report:entity-candidates -- --limit=50
npm run --silent report:entity-candidates -- --json > /tmp/echo-entity-candidates.json
npm run --silent report:entity-candidates -- --csv > /tmp/echo-entity-candidates.csv
```

The default scope is published shows with zero authored entity relationships
against public entities. Use `--include-linked` to inspect partially connected
shows too, and `--all` to include draft source records. The command performs no
network requests and has no write mode.

The JSON report contains:

- `candidates`: one show-level lead per possible target, with the source path,
  exact field/value evidence, current links, match kind, confidence, and any
  role suggestion;
- `batches`: grouped manual work by existing entity or possible new entity,
  including show IDs, titles, source fields, and raw evidence;
- `compoundReviews`: the compound evidence queue, including existing component
  matches and conservatively split display components;
- `compoundBatches`: repeated compound field/value groups for batching.

The CSV is a flat row per candidate and is intended for a spreadsheet or a
manual enrichment checklist. It includes credit-only leads as well as
relationship-eligible candidates; filter `relationshipEligible=true` before
using it as a relationship work queue.

## Evidence policy

The tool reads only values already present in authored show records and the
authored entity registry. It considers:

- `creatorId`, `networkId`, `creators`, and the existing core credit fields;
- explicit production-company, studio, network, creator, owner, author, cast,
  writer, director, producer, sound, publisher, distributor, and related credit
  strings under `credits`;
- structured `credits.people[].name` values and stored import-field provenance
  when available;
- exact normalized entity names/aliases, exact legacy entity IDs, explicit
  compound components, and repeated source names across shows.

It does not parse descriptions, archive reviews, themes, tags, similar-show
copy, or other prose for entity relationships. It does not scrape or request
external sources. Stored source URLs may be carried into evidence provenance,
but they are not fetched by this tool.

The resolver is intentionally conservative:

- whole-value normalized names and exact legacy IDs are stronger than
  component matches;
- a component match from a compound creator/owner/cast string is a review lead,
  not an automatic creator relationship;
- explicit `credits.productionCompany`, `credits.studio`, and
  `credits.network` fields may suggest their corresponding roles, subject to
  manual confirmation;
- a non-compound creator field may suggest `creator`; legacy `creatorId` only
  receives that suggestion for an exact ID match to a person;
- cast, writer, director, producer, owner, sound, and other unsupported credit
  fields can produce a credit-only lead, but they do not receive a public role;
- known hosting/funding labels such as ART19, Buzzsprout, RSS.com, Spreaker,
  Spotify, and Patreon are not proposed as new directory entities;
- no relationship is proposed for a target already linked on the source show.

`confidence` is a review priority, not a truth claim. `high` means the stored
field and registry match are unusually direct; `medium` means the source is
explicit or repeated but still needs entity/role review; `low` means the lead is
compound, legacy-component, or credit-only evidence.

## Compound evidence

The graph report currently identifies 91 unlinked published shows with
compound core evidence. The candidate report keeps those records in a separate
queue. It preserves every raw field/value pair, reports any existing registry
component matches, groups repeated compound values, and shows conservative
manual-split components. A reviewer must decide whether each component is a
person, production company, studio, network, or no entity at all.

Do not create a synthetic entity for the combined string, and do not turn a
comma, slash, ampersand, or “and” separator into a public relationship without
checking the actual credit meaning. Compound values can mix people,
organizations, networks, platforms, and show titles.

## Manual authoring after review

After a maintainer confirms a candidate, author the registry/entity changes and
the show `entityLinks` deliberately in `catalog-src/`. Follow the role and
publication rules in [Creators authoring](CREATORS.md), then run the normal
catalog validation and rebuild workflow. This report is intentionally not an
approval or migration command.
