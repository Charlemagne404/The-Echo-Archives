# Discovery Tag Taxonomy

`catalog-src/tag-taxonomy.json` is the authoritative vocabulary for public
discovery tags in the 1.0 release. A tag is a reusable listener-facing
discovery signal, not a transcription of every publisher keyword or plot
detail.

## Boundaries

- Genres belong in `genres`; `drama` is valid there only when it describes the story's content, never because the work is an audio drama.
- Production and narrative form belong in `formats` (`full-cast`, `anthology`, `serialized`, and so on).
- Public `tags` are approved taxonomy labels grouped as genre, setting, hook, framing, tone/style, era, or representation.
- Publisher categories, keywords, and public-submission free text remain provenance or review hints. They never create public tags automatically.

## Governance

Only a maintainer may add or change a taxonomy entry. A proposal needs a supported listener-discovery purpose, a facet, source evidence, no existing synonym, and either demonstrated reuse or a documented reason it is an intentionally rare canonical term. Do not approve jobs, props, named places, marketing adjectives, ratings, editorial recommendations, or one-show plot details.

Each entry has one of three lifecycle statuses:

- `approved` is the only status that may appear in public `tags` or power discovery chips, filters, and search facets.
- `provisional` records a specific exception while it is being assessed. It needs `rationale`, at least one HTTP(S) `evidence` URL, and a `reviewBy` date; code validates all three. It is retained in import metadata as a taxonomy proposal and is excluded from public discovery.
- `deprecated` cannot be selected for new public tags. Existing use must be migrated away before publication.

Free-text terms are not a fallback public vocabulary. The importer preserves them as proposals, shows a readiness warning, and keeps them out of the public record until a maintainer explicitly adds or promotes a taxonomy entry. This deliberately permits research and exceptions without weakening listener discovery.

Published records use only approved labels. Deprecated or unknown labels block publication. Browse filters expose only tags used by at least two published shows; approved low-frequency tags remain searchable in full text until they gain reuse.

Run `rtk node tools/migrate-discovery-tags.js` to inspect the controlled migration, or add `--write` only when intentionally applying its reviewed dispositions.

## Vocabulary health

The validation report must have zero unknown, provisional, or deprecated public
tags. It also reports approved labels used by one show so maintainers can review
whether they represent a durable listener route or should be deprecated. Raw
publisher keywords remain provenance only.

### Editorial status audit — 2026-08-18

Every current taxonomy label was reviewed against its facet, reuse, and whether
it gives a listener a durable discovery route. The vocabulary now contains 135
approved labels and 30 deprecated labels. The deprecated group consists of
props, occupations, named-property references, generic plot beats, and
release/format details that belong in factual metadata rather than discovery:
`Amnesia`, `Ancient artifact`, `Bunker`, `Daily release`, `Experimental science`,
`Exploration`, `Floating city`, `Island mystery`, `Late-night radio`, `Lost
spaceship`, `Magical objects`, `Memory`, `Metaphysical`, `Military outcasts`,
`Mini-series`, `Missing person`, `Missing plane`, `Missing town`, `Paradoxes`,
`Radio`, `Resistance`, `Rivalry`, `Seasonal anthology`, `Secret agency`,
`Secret government`, `Sherlock Holmes`, `Therapy`, `Time displacement`, `Video
games`, and `Wormholes`.

This is not a frequency-only rule: rare, reusable listener routes remain
approved where they are materially distinctive, such as `Cryonics`, `Filipino`,
`Folk horror`, and `Xenoarchaeology`.
