# Public machine-readable reference

The Echo Archives keeps human-facing pages primary. The machine-readable
surface mirrors the same published catalogue and does not create a second
recommendation system or a crawler-only content layer.

## Discovery document

`/data/archive.json` is the small public index for automated reference tools,
research scripts, and agents. It is intentionally `noindex` because it is a
data resource, not a search landing page.

The document contains:

- `schemaVersion`, `canonical`, `homepage`, and `sitemap`;
- counts for published shows, public collections, and public entities;
- the existing JSON resources, their media type, record type, stable `id`
  field, and canonical URL template;
- relationship declarations for typed entity credits, curated similarity, and
  collection membership.

The resource links are:

- `/data/shows.json` — complete published show records;
- `/data/collections.json` — public collection records;
- `/data/entities.json` — source-backed public creator, production-company,
  studio, and network records;
- `/data/entity-graph.json` — typed show/entity edges, reverse show membership,
  and derived shared-show connections;
- `/data/search-index.json` — a search projection; use `shows.json` for
  complete reference data.

The records use stable archive IDs. Canonical public pages remain the
authoritative human-readable references: `/shows/{id}`,
`/collections/{id}`, and `/creators/{id}`. `href` values in show records,
`showIds` in collections, and `entityLinks` / `resolvedEntities` in shows
connect those records without requiring HTML scraping.

The entity graph is a derived projection of the same authored `entityLinks`;
its `semantics` field states which parts are source-backed and which are
derived. Shared-show connections are co-occurrence signals, not assertions of
direct affiliation.

## Structured data relationships

Show pages expose a stable `PodcastSeries` `@id` derived from the canonical
show URL. Existing factual fields are added only when present: aliases,
controlled keywords, languages, season and episode counts, and official or
listening URLs. Typed entity links use `creator` for people/creator entities,
`producer` for production companies and studios, and `provider` for explicit
network relationships. A network is not represented as a publisher unless
the catalogue supplies that fact separately.

Collection pages use `ItemList` entries whose `item` points to the canonical
show `PodcastSeries` node, while the list entry description retains the
collection-specific reason. Show pages expose their collection URLs as
`relatedLink` values. The collections directory applies the same stable-item
pattern to collection pages.

## Boundaries

Filtered discovery URLs, private/operational data, unresolved records, and
unsupported claims remain outside this reference surface. No `llms.txt` or
other crawler-specific protocol is required: the sitemap, canonical pages,
Markdown negotiation, JSON-LD, and this documented JSON index cover the useful
machine-consumption paths without changing the listener-first product.
