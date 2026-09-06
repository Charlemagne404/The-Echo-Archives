# Creators: authoring and discovery

Echo 1.1.0 introduces one curated registry at `catalog-src/entities.json`.
It generates `data/entities.json`; do not edit the generated file. The legacy
optional `data/creators.json` and `data/networks.json` loaders remain compatible,
but neither is a source for the public directory.

## Create an entity

Add an authored record to the registry:

```json
{
  "id": "example-studio",
  "name": "Example Studio",
  "type": "studio",
  "aliases": ["Example Audio"],
  "publication": "draft",
  "indexable": false
}
```

This is an illustrative draft, not catalog data. IDs use lowercase letters,
digits and single hyphens, with a maximum of 80 characters. Choose the ID once:
renaming the display name must never change the ID or existing show links.

Types are `person`, `production-company`, `studio`, and `network`. Choose the
entity's best factual identity; the relationship role can differ by show.
For example, Night Vale Presents is a network with a production-company credit
on Welcome to Night Vale. Do not create a second entity for that role.

Optional fields are `website` (HTTP/S), `description` (up to 500 characters of
factual authored copy), and `directory` (a boolean visibility override). By
default, public organization entities appear in the main directory while
`person` entities remain detail/search/show-link only. Set `directory: true`
only for an exceptional person whose public identity is itself a recognizable
multi-show production brand; set `directory: false` to keep any entity out of
the top-level cards without removing its internal identity or detail route. No
biography is required. Omit uncertain claims.

## Aliases

Add established alternate spellings, trading names, or an old display name to
`aliases`. Normalization ignores case, accents and punctuation and treats `&`
as `and`. An alias or canonical name cannot resolve to two different entities.
Duplicate normalized aliases in one record also fail validation. A display-name
spelling in `aliases` is allowed, but usually unnecessary unless retaining the
original source spelling helps maintainers.

Aliases are search terms only. They do not produce routes, HTML files, sitemap
entries, redirects or duplicate profiles. Every public link uses the stable ID.
The compatibility `/creators/<id>/index.html` URL redirects to `/creators/<id>`
on the Node server, as do query-bearing entity detail URLs and trailing slashes.

## Link an existing show

Add `entityLinks` in its existing `catalog-src/shows/<id>.json` record:

```json
"entityLinks": [
  { "entityId": "example-studio", "role": "studio" }
]
```

Roles are deliberately limited:

| Role | Public label | Meaning |
| --- | --- | --- |
| `creator` | Created by | The credited creator, including an individual person |
| `production-company` | Produced by | The company responsible for production |
| `studio` | Studio | An explicitly credited studio |
| `network` | Network | A meaningful network affiliation |

People can only use `creator`. Do not expand the model into cast, writing,
directing or sound-design credits; those stay in `credits`. One entity may have
different roles across shows. Duplicate show/entity/role triples are errors.
An unknown entity ID or invalid role fails catalog loading, validation and build.

Use existing factual credits and their objective-source evidence, or review new
official evidence. Never infer relationships by substrings, shared hosting,
similar titles, matching RSS usernames or a legacy slug alone. Keep legacy
`creators`, `creatorId`, `networkId`, and `credits` fields while migrating.
Adding an entity link does not change a show's review tier or verification state.

## Publication and indexability

Before setting `publication` to `public`, supply a valid `reviewedAt` date and
a nonempty `sources` array of HTTP/S evidence URLs. The date records the entity
review, not a creator-verification claim. Source-backed existing catalog facts
can be reused; document the mapping and any unresolved ambiguity.

- Draft entities are excluded from public JSON, resolved public show links,
  directory entries, generated pages, search suggestions and sitemaps.
- Public entities need at least one linked published show to have a page.
- Search indexability additionally requires `indexable: true` and at least two
  linked published shows. Public one-show pages remain `noindex, follow`.
- The top-level `/creators` cards use the organization-led directory predicate;
  a person may still have a public detail page, be searchable, and remain
  linked from a show without receiving a directory card.
- Retiring publication removes the generated entity page during `build:pages`.
  Only files carrying the generator banner are eligible for cleanup.
- Raw creator/network strings never acquire pages automatically.

Do not create directory entities for ART19, Buzzsprout, RSS.com, Spreaker or
other hosting labels merely because they occupy legacy network fields. Compound
credits require review and separate entities where justified. Do not treat
names of two people as a third organization, or collapse a person into a studio.

## Rendering and search

`shared/archive-entities.js` owns publication predicates, explicit memberships,
directory visibility, alias matching, fact rows, structured references and More
from selection.
The catalog loader resolves public entities onto runtime show records as
`resolvedEntities`; this field is generated and must not be authored.
`entityLinks` remains the source of membership, including on the server.

The directory and detail catalogues render before JavaScript runs. Directory
search works as a GET form and is enhanced with local filtering. Detail pages
reuse existing show and collection cards. Structured show data maps creators to `creator` and production companies to
`producer`; the WebPage mentions all linked entities. A network affiliation or
studio credit does not automatically assert publishing or production ownership.
The Node server uses the same entity
renderer as the page build, so publication changes also apply to direct routes.

Creator SEO is generated from the same registry and show relationships. The
directory and qualifying entity pages get unique titles and descriptions,
review dates, canonical URLs, social images, breadcrumbs, entity structured
data, and source-backed lists of connected podcast series. The page and
sitemap use `reviewedAt` as the freshness signal. These additions improve
discovery without adding visible content or inventing biographies, ratings,
endorsements, or complete discographies.

Browse search retains legacy creator strings and adds resolved canonical names
and aliases to the existing creator search field. Its creator result links are
derived from that same search-index payload; there is no new search endpoint.

Show facts use structured public relationships first. Unmigrated shows retain
the old Creator / network fallback. When only a company/network is migrated,
unmigrated individual creator credits remain plain text. Compound legacy credit
strings are suppressed in the structured presentation.

More from uses explicit membership only, requires at least three other
published shows, and renders at most four cards. It selects one entity by
production company, studio, creator, then network; ties use catalogue size and
stable ID. Alternatives sort by title and stable ID and exclude the current
show. Collection connections rank by actual shared show count, then title.

## Pilot and curation evidence

The pilot review started from the authored catalog and its official-source
links. The 1.1.0 curation pass then checked the recurring organization-level
matches against official company, network, studio, and show pages before adding
relationships. The resulting directory is intentionally curated rather than a
complete discography or a list of every person in the credits.

| Entity | Shows | Evidence used |
| --- | --- | --- |
| 7 Lamb Productions | Tower 4, Paralyzed, Crystal Blue, End of All Hope, Story, Atlas Avenue Beat | Existing company credits; Atlas's compound creator credit and 7 Lamb Productions LLC owner credit |
| Bloody FM | 17 shows | Explicit network/creator/owner credits, including the Bloody FM catalog and the 7 Lamb co-production records |
| Fool & Scholar Productions | Don't Mind, The Liberty Podcast, The White Vault, Vast Horizon | Company/owner credits and Fool & Scholar official show URLs |
| K.A. Statz | The White Vault, Vast Horizon | Separate `credits.creatorName` entries |
| Travis Vengroff | The White Vault, Vast Horizon | Separate `credits.creatorName` entries |
| QCODE | 10 shows | Explicit production-company/owner credits and official QCODE show pages, including co-productions |
| Night Vale Presents | 4 shows | Explicit network/creator/owner credits and official Night Vale show pages |

The curated registry now contains 40 public organization entities and two public
person entities. The listed catalogues describe confirmed archive connections
and are not claims to be complete company discographies. Hosting and
distribution labels such as ART19, Buzzsprout, RSS.com, Spreaker and Spotify
remain infrastructure metadata, not creator-directory entities.

## Maintenance checks

Run `npm run build:catalog`, then `npm run build:pages`. Relevant checks are
`npm --prefix backend run validate:data`, `npm --prefix backend run check:links`,
`npm --prefix backend run test:entities`, `npm run test:tools`, and
`npm run check:structure`. `npm --prefix backend run test:serial` runs the full
backend unit/integration suite without the catalog-load contention of a parallel
run. The focused entity command includes browser checks using the existing
Playwright helper; `SMOKE_BROWSER=firefox` or `webkit` selects another engine.
