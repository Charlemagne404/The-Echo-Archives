# Discovery Tag Taxonomy

`catalog-src/tag-taxonomy.json` is the authoritative vocabulary for public discovery tags. A tag is a reusable listener-facing discovery signal, not a transcription of every publisher keyword or plot detail.

## Boundaries

- Genres belong in `genres`; `drama` is valid there only when it describes the story's content, never because the work is an audio drama.
- Production and narrative form belong in `formats` (`full-cast`, `anthology`, `serialized`, and so on).
- Public `tags` are approved taxonomy labels grouped as genre, setting, hook, framing, tone/style, era, or representation.
- Publisher categories, keywords, and public-submission free text remain provenance or review hints. They never create public tags automatically.

## Governance

Only a maintainer may add or change a taxonomy entry. A proposal needs a supported listener-discovery purpose, a facet, source evidence, no existing synonym, and either demonstrated reuse or a documented reason it is an intentionally rare canonical term. Do not approve jobs, props, named places, marketing adjectives, ratings, editorial recommendations, or one-show plot details.

Published records use only approved labels. Deprecated or unknown labels block publication. Browse filters expose only tags used by at least two published shows; approved low-frequency tags remain searchable in full text until they gain reuse.

Run `rtk node tools/migrate-discovery-tags.js` to inspect the controlled migration, or add `--write` only when intentionally applying its reviewed dispositions.
