# Phase 2 controlled factual entity-graph reconciliation — 2026-09-16

## Scope and decision

Phase 2 reconciled the generated catalog with the authored source and added a
small, high-confidence batch of factual entity relationships. It did not add
or infer tones, themes, `bestFor`, archive ratings, archive takes, reviews,
authored `similarTo` relationships, subjective discovery profiles, or
subjective collection memberships.

The authoritative inputs remain `catalog-src/`, especially
`catalog-src/entities.json` and each show's explicit `entityLinks`. The
generated `data/` layer, generated status files, sitemap, and service-worker
manifest were rebuilt deterministically. No deployment, publication, or
external write was performed.

The Phase 1 report at
`docs/qa/2026-09-16-phase-1-factual-data.md` was reviewed first. Its retained
research gaps were carried through the rebuild; they were not silently
converted into facts.

## 1. Generated reconciliation

### Source counts

The source baseline below is the authored-source graph snapshot captured before
the Phase 2 entity additions. The final source counts are from the current
working tree after those additions.

| Authored source measure | Before | After |
| --- | ---: | ---: |
| Shows | 752 | 752 |
| Collections | 46 | 46 |
| Review companions | 7 | 7 |
| Public entity records | 123 | 132 |
| Typed relationship records | 307 | 318 |
| Shows with at least one typed entity | 256 | 266 |
| Shows with no typed entity | 496 | 486 |
| Collection membership edges | 688 | 687 |

The one-edge collection difference is not a Phase 2 entity change. It is in
the pre-existing dirty collection work involving White Vault/Sojourn records;
no `catalog-src/collections/` file was edited by this pass. The source-side
entity changes are therefore +9 public entities and +11 typed links across 10
show records.

### Generated counts

The generated layer at `HEAD` was stale before the controlled rebuild. The
first rebuild brought the already-authored Julian Koster entity and prior
Phase 1 source state into runtime; the final rebuild includes the Phase 2
batch.

| Generated measure | Stale before rebuild | After first controlled rebuild | Final after Phase 2 |
| --- | ---: | ---: | ---: |
| `data/shows.json` records | 752 | 752 | 752 |
| `data/collections.json` records | 46 | 46 | 46 |
| `data/entities.json` records | 122 | 123 | 132 |
| Generated review companions | 7 | 7 | 7 |
| Search-index entries | 752 | 752 | 752 |
| `archive-stats.creatorCount` | 674 | 676 | 676 |
| `catalog-status.publicEntities` | 122 | 123 | 132 |
| `catalog-status.showsWithEntityLinks` | 256 | 256 | 266 |
| `catalog-status.withResearchGaps` | 22 | 25 | 25 |

The generated status now records 25 documented research-gap records. The six
missing RSS links remain explicitly documented or intentionally outside the
RSS model: `earth-eclipsed`, `the-rapscallion-agency`,
`the-invenios-expeditions`, `batman-unburied`, `the-sojourn`, and
`rosannas-secret`. `report:catalog` classifies the current actionable RSS gap
count as zero.

### Generated files changed

The controlled generators changed:

- `data/archive-stats.json`
- `data/collections.json`
- `data/entities.json`
- `data/reviews/oz-9.json`
- `data/reviews/the-white-vault.json`
- `data/search-index.json`
- `data/shows.json`
- `docs/generated/catalog-status.json`
- `docs/generated/catalog-status.md`
- `sitemap.xml`
- `sw.js`

The `data/entities.json`, entity-bearing portions of `data/shows.json` and
`data/search-index.json`, and generated status deltas are explained by the
authored entity additions and deterministic generation. The Oz-9/White Vault
review/show mirrors and the collection changes are generated reflections of
pre-existing dirty source work and were preserved. `sitemap.xml`, `sw.js`,
and ignored generated entity pages are deterministic `build:pages` output.

`npm run report:catalog` reported generated `shows`, `collections`,
`search-index`, and `catalog-status` drift as clean after the rebuild; there
was no unexplained generated churn. `npm run check:generated` also confirmed
170 generated HTML pages remain ignored/untracked and 32 authored HTML files
remain preserved.

### Gate B result

Gate B remains complete:

- Phase 2 / Gate B blocking errors: **0**
- Actionable RSS gaps: **0**
- Documented research-gap records: **25**
- Editorial gaps: **0**
- Unknown/non-approved taxonomy tags: **0**

## 2. Entity evidence audit

### Canonical versus legacy evidence

The audit followed `docs/CREATORS.md`, `data/schema.md`,
`shared/archive-entities.js`, `backend/lib/entities.js`,
`backend/lib/entity-graph-report.js`, and
`backend/lib/entity-enrichment-candidates.js`.

| Evidence | Treatment in this phase |
| --- | --- |
| `catalog-src/entities.json` | Canonical registry: stable ID, display name, type, aliases, publication, indexability, and entity-level sources. |
| `entityLinks` | Canonical show-to-entity relationship and show-specific role. Only these links create graph membership and entity-page relationships. |
| `creatorId`, `networkId`, `creators` | Legacy/source evidence and migration hints, not foreign keys. A slug or raw string alone is insufficient for automatic resolution. |
| `credits.creatorName` | Useful creator evidence when a source explicitly supports the identity and role. Compound strings remain manual. |
| `credits.productionCompany` | Strong production evidence when the show or company source explicitly identifies production responsibility. |
| `credits.studio` | Strong studio evidence when the source explicitly credits a studio. |
| `credits.network` | Network/brand evidence, but not automatic production ownership. The role must be supported by the source and may remain a show-specific network relationship. |
| `credits.distributor`, publisher, platform, hosting labels | Supporting evidence only. These do not become production entities without an explicit production relationship. |
| `metadata.objectiveSources`, provider metadata, feed fields | Research leads and corroboration. They do not independently justify converting a raw value into a typed entity. |

Name matching uses the existing normalization and alias logic. Repeated exact
organization evidence can be safely batched when the official source supports
the same identity and role across shows. Person names, compound credits,
provider labels, and one-off legacy values remain queued for manual review.

## 3. High-confidence entity resolutions made

The batch intentionally favors repeated production identities and direct
official evidence. Single-show entities are non-directory or non-indexable
unless the evidence supports a useful multi-show hub; this avoids creating
hundreds of one-show pages.

| Entity | Type | Affected shows | Relationship role | Aliases and page policy | Evidence and confidence |
| --- | --- | --- | --- | --- | --- |
| David S. Goyer | `person` | Batman Unburied | `creator` | No alias; `directory:false`, `indexable:false` | The [DC announcement](https://www.dc.com/blog/2020/09/29/david-s-goyer-warner-bros-and-dc-set-to-bring-batman-unburied-to-spotify) and [Spotify production announcement](https://newsroom.spotify.com/2021-02-22/audio-brings-new-dimension-to-the-dc-comics-universe/) identify Goyer's creator/writer/producer role. **High.** |
| Warner Bros. | `production-company` | Batman Unburied | `production-company` | No alias; `directory:false`, `indexable:false` | The [DC announcement](https://www.dc.com/blog/2020/09/29/david-s-goyer-warner-bros-and-dc-set-to-bring-batman-unburied-to-spotify) explicitly places Warner Bros. in the production announcement; the show source separately retains Spotify as distributor. **High.** |
| Third Person | `studio` | Midst; Blueberries Hill | `production-company` | No alias; `indexable:true`; `https://www.thirdperson.media/` | [Third Person](https://www.thirdperson.media/) identifies the studio, while [Blueberries Hill](https://www.blueberrieshill.com/) explicitly says the show is produced by Third Person. The same studio identity is supported for Midst. The intentional type/role divergence is documented below. **High.** |
| Goblin Booth Productions | `production-company` | Route 6.6; The Harrowing of Minerva Damson | `production-company` | Alias `Goblin Booth Productions, LLC`; `indexable:true`; `https://www.goblinboothproductions.com/` | The [official Goblin Booth site](https://www.goblinboothproductions.com/) and the [Route 6.6](https://shows.acast.com/route6point6) and [Minerva Damson](https://shows.acast.com/the-harrowing-of-minerva-damson) show pages identify the same production company. **High; repeated batch.** |
| Dirt Road Theater | `production-company` | Fairies and Dragons, Ponies and Knights | `production-company` | No alias; `directory:false`, `indexable:false` | The [official FADPAK page](https://www.dirtroadtheater.com/fadpak) says the show is produced by Dirt Road Theater and identifies its creators. **High relationship; person decomposition remains queued.** |
| Stak | `production-company` | Jackie the Ripper | `production-company` | No alias; `directory:false`, `indexable:false` | The [Stak show page](https://stak.london/shows/jackie-the-ripper/) and [Stak company site](https://www.stak.london/) support the production identity. **High relationship; creator people remain in credits.** |
| Goatshead Castle Productions | `production-company` | Rosanna's Secret | `production-company` | Alias `Goatshead Castle Creations`; `directory:false`, `indexable:false` | The [official Rosanna's Secret page](https://samanthavhutton.com/podcast/rosannas-secret-2/), [series playlist](https://www.youtube.com/playlist?list=PLQHiDb_oo19OUDZ83ovUHm36acdM2degU), and [Spotify episode](https://open.spotify.com/episode/5yzy8xOszgpVCKRKM6Okr4) support the production identity and the source spelling variant. **High relationship; medium single-show alias confidence.** |
| Metal Steve Productions | `production-company` | Station Arcadia | `production-company` | No alias; `directory:false`, `indexable:false` | The official [Station Arcadia site](https://stationarcadia.wixsite.com/podcast) and the Apple source credit support the company name. **Medium-high; single-show entity.** |
| Strangekind Studio | `studio` | MERCY: A Queer Eldritch Western | `studio` | Alias `STRANGEKIND STUDIO`; `directory:false`, `indexable:false`; `https://strangekindstudio.weebly.com/` | [Strangekind's site](https://strangekindstudio.weebly.com/) and its [MERCY cast/crew page](https://strangekindstudio.weebly.com/mercycastcrew.html) identify the collective/studio and the show. **High.** |

This is 9 canonical entities and 11 typed links. No legacy creator, network,
or credit field was deleted or rewritten as part of these links.

## 4. Entity graph before and after

The “before” column is the source-only report captured before the batch; the
“after” column is the current source-only report.

| Measure | Before | After |
| --- | ---: | ---: |
| Public entities | 123 | 132 |
| Typed relationship records | 307 | 318 |
| Shows with at least one typed entity | 256 / 752 (34.04%) | 266 / 752 (35.37%) |
| Shows with no typed entity | 496 | 486 |
| Creator-role coverage | 60 shows / 66 edges (7.98%) | 61 shows / 67 edges (8.11%) |
| Production-company coverage | 156 shows / 157 edges (20.74%) | 165 shows / 166 edges (21.94%) |
| Studio coverage | 9 shows / 9 edges (1.20%) | 10 shows / 10 edges (1.33%) |
| Network coverage | 75 shows / 75 edges (9.97%) | 75 shows / 75 edges (9.97%) |
| Shows with creator evidence but no creator relationship | 692 | 691 |
| Shows with only organization relationships | 196 | 205 |
| Orphan public entities | 0 | 0 |

### Entity-page usefulness

| Linked-show bin | Before | After |
| --- | ---: | ---: |
| Exactly 1 linked show | 54 | 61 |
| Exactly 2 linked shows | 35 | 37 |
| Exactly 3 linked shows | 15 | 15 |
| At least 3 linked shows | 34 | 34 |
| At least 4 linked shows | 19 | 19 |
| At least 2 linked shows | 69 | 71 |

Under the current More from policy, an entity must have at least three other
published shows for a show route to be useful. The batch therefore leaves the
useful hub count at **19 entities** and the generated show-page More from
coverage at **131 pages**. The change is deliberate: the new one-show and
two-show records are factual foundation, not a reason to create thin public
directories.

Ten shows gained their first typed entity. Batman Unburied gained its first and
second typed entities in one evidence-backed batch; one show therefore gained
a second-or-later typed relationship. No existing multi-show hub was
artificially split or duplicated.

## 5. Type/role divergence warnings

The previous source report contained 41 warnings. All 41 were investigated and
left unchanged. They are classification **1: correct relationship / validator
limitation**, not automatic errors.

The model intentionally separates an entity's best canonical type from a
show-specific relationship role. `docs/CREATORS.md` explicitly allows, for
example, a `network` entity to carry a `production-company` show relationship.
The source fields and existing official-source evidence support these
show-specific roles. Changing the entity type globally would damage other
shows; changing the role would discard the source's actual relationship. For
organization-valued `creator` roles, the source names the organization as the
credited creator and does not safely decompose it into people, so no person
entity was invented.

| Existing entity and canonical type | Previously warned shows | Show role | Classification | Fixed? and why |
| --- | --- | --- | --- | --- |
| Faustian Nonsense (`network`) | `a-midsummers-quarantine`; `jack-of-all-trades`; `super-suits` | `production-company` | 1 | No. The show-level production credit is retained while the organization remains canonically a network. |
| Night Vale Presents (`network`) | `adventures-in-new-america`; `the-orbiting-human-circus`; `welcome-to-night-vale` | `production-company` | 1 | No. Existing official/source credits support production-company relationships; no second entity is justified. |
| Realm (`network`) | `blood-gold`; `machina`; `orphan-black-the-next-chapter`; `sonic-the-hedgehog-presents-the-chaotix-casefiles` | `production-company` | 1 | No. These show links are retained as source-backed organization relationships; distributor-only evidence such as Parkdale is not added. |
| iHeartPodcasts (`network`) | `bridgewater`; `buzz-the-man-the-moon`; `havoc-town`; `light-house`; `magmell`; `mordeo`; `saigon`; `strawberry-spring`; `supreme-the-battle-for-roe`; `the-mantawauk-caves`; `the-second-oil-age`; `you-feeling-this` | `production-company` | 1 | No. The network entity is reused and the production role remains show-specific. |
| Red Fathom Entertainment (`production-company`) | `cybernautica`; `hannahpocalypse` | `creator` | 1 | No. The authored creator evidence names the organization; no individual creator decomposition is supported by this graph pass. |
| Rusty Quill (`production-company`) | `last-dance`; `malevolent`; `the-magnus-archives`; `the-magnus-protocol` | `network` | 1 | No. The network affiliation is meaningful for these show records, while Rusty Quill's canonical type remains production-company. |
| Passer Vulpes Productions (`production-company`) | `love-and-luck`; `supernatural-sexuality-with-dr-seabrooke` | `creator` | 1 | No. The source uses the production organization in the creator field; no safe person replacement was found. |
| Ponders Productions (`production-company`) | `mars-best-brisket`; `the-wanderer` | `creator` | 1 | No. Organization-valued creator evidence remains explicit and is not relabeled as a person. |
| Meet Cute (`production-company`) | `meet-cute-originals`; `my-date-with-lainey-lee` | `creator` | 1 | No. The source-backed creator brand is retained without inventing a personal creator. |
| Wizzard Wizzard Productions (`production-company`) | `starfall`; `the-beacon` | `creator` | 1 | No. The existing creator relationship is organization-valued and source-backed. |
| Leviathan Audio Productions (`production-company`) | `the-invenios-expeditions`; `the-rapscallion-agency` | `network` | 1 | No. The network role is retained as a show affiliation; no type correction is supported. |
| Fable & Folly (`network`) | `the-secret-of-st-kilda` | `production-company` | 1 | No. The current source supports a production-company relationship while the shared entity remains a network. |
| Good Pointe (`production-company`) | `the-subjective-truth`; `two-flat-earthers-kidnap-a-freemason` | `network` | 1 | No. Good Pointe is a meaningful network affiliation for these shows; the shared Spotify collision was handled separately in Phase 1. |

The current report has 43 warnings, not 41, because the two new Third Person
links add the following intentional warning:

| New entity | Shows | Type / role | Classification | Decision |
| --- | --- | --- | --- | --- |
| Third Person | `midst`; `blueberries-hill` | `studio` / `production-company` | 1 | No fix. The official studio identity and the explicit “produced by Third Person” relationship are both factual. |

There are no duplicate relationship groups, same-entity multi-role groups,
person-role violations, unknown entity references, non-public references, or
linked-evidence conflicts in the final graph.

## 6. Unresolved entity-resolution queue

The queue is generated from authored source only by:

```text
npm run report:entity-candidates -- --limit=120
```

It is intentionally report-only; it does not write entities or links. The
current deduplicated queue contains:

- 486 published shows with no typed relationship; all 486 still have some
  legacy evidence, and none are being treated as “no evidence.”
- 1,715 unresolved unique field/value combinations across those unlinked
  shows.
- 31 relationship candidates across 33 shows.
- 2 existing-entity/supporting-credit candidates, 31 new-entity candidates,
  and 2 credit leads without a safe public role.
- 84 shows with compound core evidence, containing 187 compound values and
  187 manual review batches.
- 31 relationship batches, all marked manual rather than safe for blind
  automatic resolution.

### Priority groups

| Queue group | Highest-impact evidence | Decision |
| --- | --- | --- |
| Repeated platform/publisher values | `Audible` occurs on Blood Ties and The Last City; `BBC` occurs on The Archers and The Cipher. | Keep queued. These may be publisher, broadcaster, platform, or distributor identities; the current model cannot safely make them production entities from these fields. |
| Organization/brand hints | `RiggStories` on Copperheart and `Haunted Air Audio` on Campfire Radio Theater are network-field leads with unresolved organization-versus-brand semantics. | Manual review required. Do not create a typed relationship from the network field alone. |
| Existing entity but unsupported role | Realm on Parkdale Haunt appears in `credits.distributor`. | Supporting credit only; do not link Realm as production/network from distributor evidence. |
| Existing person inside a compound producer credit | Hubris contains “Caroline Mincks, Anne Baird, and Tal Minear.” | Keep Tal Minear as a supporting credit lead. The official page says the trio produced the project, but this does not by itself establish a creator relationship for Tal or the other people. |
| Compound person/company strings | Examples include `Airship / Audible`, `Miles Davis and Alex Lee`, `Amy Frost and J-F. Dubeau`, `Gracelyn, Oliver and Dominic Spillane`, and `Michael Ireland & Naomi Clarke`. | Manual decomposition only. Preserve the exact source string and research each component before creating people or companies. |
| Hosting and feed infrastructure | `Buzzsprout` 22, `RSS.com` 20, `ART19` 17, and `Spreaker` 13 in repeated legacy evidence; other examples include Acast, Megaphone, Libsyn, Simplecast, Pinecast, Omny, and Podbean. | Keep out of the production graph. These are hosting/distribution infrastructure unless a separate source establishes another role. |
| Noisy one-off network fields | Examples include `Bluesky Social`, `Buy Me a Coffee`, `My Site`, `Så fungerar YouTube`, `Some Doors Should Not be Opened`, and title-like or social-account strings. | Low-value/manual queue. Do not create public entities. |

### Exact candidate batches

The 31 report batches below are the complete candidate set after this Phase 2
pass. The candidate name is a normalized evidence label, not a canonical
entity decision. Type, role, official URL, and alias remain unresolved unless
explicitly stated in the disposition. Every row is manual; none is safe for
automatic or blind batched publication.

| Evidence candidate | Shows | Source field(s) | Tool confidence | Disposition |
| --- | --- | --- | --- | --- |
| Realm (existing entity) | `parkdale-haunt` | `credits.distributor` | medium | Existing `network`; supporting credit only, no relationship. |
| Tal Minear (existing entity) | `hubris-a-24-hour-podcast-project` | `creatorId`, `creators`, `credits.creatorName`, `credits.ownerName` | low | Existing `person`; compound producer evidence only, no creator relationship. |
| Audible | `blood-ties`, `the-last-city` | `creatorId`, `creators`, `credits.creatorName` | medium | Type/role unresolved; platform/publisher semantics likely. |
| BBC | `the-archers`, `the-cipher` | `creatorId`, `creators`, `credits.creatorName`, `credits.network`, `credits.people[0].name`, `networkId` | medium | Type/role unresolved; broadcaster/platform semantics likely. |
| Bluesky Social | `the-pasithea-powder` | `credits.network` | medium | Type/role unresolved; likely social/platform evidence. |
| Buy Me a Coffee | `the-montana-incident` | `credits.network` | medium | Type/role unresolved; support platform, not production evidence. |
| C. S. W. | `hemophobia` | `credits.network` | medium | Type/role unresolved; one-off raw value. |
| Candy Claus | `candy-claus-private-eye` | `credits.network` | medium | Type/role unresolved; may be a person or title-like value. |
| Clio Thayer | `flashover` | `credits.network` | medium | Type/role unresolved; network field alone is insufficient. |
| DAVE BEAZLEY | `crooked-river` | `credits.network` | medium | Type/role unresolved; likely person, but no creator-role evidence was established. |
| Faithjacobsauthor | `faithfully-yours-mozart-the-courtship` | `credits.network` | medium | Type/role unresolved; likely account/author label. |
| Gateway's Haunted Playhouse | `campers-pike-on-the-forgotten-road` | `credits.network` | medium | Type/role unresolved; one-off organization/brand lead. |
| gideon | `almelem` | `credits.network` | medium | Type/role unresolved; insufficient identity evidence. |
| Haunted Air Audio | `campfire-radio-theater` | `credits.network` | medium | Type/role unresolved; organization/brand lead. |
| HFTH Podcast | `hello-from-the-hallowoods` | `credits.network` | medium | Type/role unresolved; likely show/brand label. |
| Home | `forged-bonds` | `credits.network` | medium | Type/role unresolved; title-like value. |
| horror podcasts set in the midwest | `the-dead-letter-office-of-somewhere-ohio` | `credits.network` | medium | Type/role unresolved; descriptive text, not an entity. |
| John Arthur Nichol | `sascha-martins-ripping-news` | `credits.network` | medium | Type/role unresolved; person candidate requires direct creator evidence. |
| Messenger Theatre Company | `the-dragoning` | `credits.network` | medium | Type/role unresolved; organization candidate requires production evidence. |
| My Site | `where-the-leaves-fall-purple` | `credits.network` | medium | Type/role unresolved; placeholder-like value. |
| My Site 1 | `back-again-back-again` | `credits.network` | medium | Type/role unresolved; placeholder-like value. |
| RiggStories | `copperheart-a-riggstories-audio-drama` | `credits.network` | medium | Type/role unresolved; brand/network/production distinction needs research. |
| Så fungerar YouTube | `dust` | `credits.network` | medium | Type/role unresolved; platform/program label. |
| Scribl | `unkillable` | `credits.network` | medium | Type/role unresolved; publisher/distributor possibility. |
| Shadows of a Dark Past - A Gothic Horror Podcast by Ando Valentine | `shadows-of-a-dark-past` | `credits.network` | medium | Type/role unresolved; compound title/author label. |
| Some Doors Should Not be Opened | `ostium-podcast` | `credits.network` | medium | Type/role unresolved; title-like value. |
| Stuart Pearson Music | `purgatory-missouri` | `credits.network` | medium | Type/role unresolved; likely music/credit label, not production evidence. |
| Susan Cooper VO | `the-romcom-formula` | `credits.network` | medium | Type/role unresolved; likely voice-account/person label. |
| The Great Adventures of Old Time Radio | `flash-gordon-and-buck-rogers-radio-adventurers` | `credits.network` | medium | Type/role unresolved; program/brand label. |
| THE POLYBIUS PROTOCOL | `polybius-protocol` | `credits.network` | medium | Type/role unresolved; show/title-like value. |
| Witchever Path - Sleep With A Clear Consequence | `witchever-path` | `credits.network` | medium | Type/role unresolved; program/title label. |

The remaining candidates are mostly one-show values or compound credits. They
are lower downstream impact and should follow the same source-backed manual
workflow. Alphabetical conversion would increase graph size while reducing
trustworthiness.

## 7. Data-model limitations

The current model supports only `person`, `production-company`, `studio`, and
`network`, with `creator`, `production-company`, `studio`, and `network`
relationship roles. It cannot accurately express all factual concepts found
in feed and publisher metadata.

- Distributor, publisher, platform, partner, and commissioning relationships
  are not separate roles. Spotify, Audible, BBC/BBC Sounds, Critical Role as a
  Midst partner/distributor, and Realm as a distributor therefore must not be
  relabeled as production companies without explicit production evidence.
- Hosting infrastructure is not a production entity. ART19, Buzzsprout,
  RSS.com, Spreaker, Acast, Megaphone, Libsyn, Simplecast, Pinecast, Omny,
  Podbean, and similar services remain provider metadata.
- Franchise/IP ownership is not modeled. DC, for example, may be a rights or
  franchise owner even when Warner Bros. is the explicit production-company
  evidence for Batman Unburied. No unsupported DC, Phantom Four, or Blue Ribbon
  Content relationship was added.
- Cast, writer, director, narrator, producer, composer, and other credit roles
  remain in `credits`; the typed graph intentionally does not turn every credit
  into a person relationship.
- Creator collectives and organizations credited as creators can be represented
  only through the existing organization type plus a show-specific creator
  role. That is why several legitimate type/role divergences remain visible.

No schema extension is necessary for this phase. A future model change should
be designed separately rather than overloading production-company or network
to gain coverage.

## 8. Phase 3 readiness

The following 12 published, `indexed-only` shows have a sufficiently trustworthy
current factual/entity base for an editorial review batch. This is a readiness
queue, not enrichment. Existing subjective fields are shown exactly as they
currently exist; no values were added here.

“Authored similarity” is shown as `outgoing / incoming / written-reason-count`.
“Diagnostic candidates” are the existing conservative computed-similarity pool
under `MATCH_POLICY` (`score >= 8`, sparse records `>= 7.5`, at least two
metadata dimensions and one factual anchor). “Public computed” applies the
stronger public route gate; zero means Phase 3 still needs editorial/factual
metadata before any computed route is exposed. Neither count is an authored
similarity relationship.

| Show | Current entity links | Collections | Current tones / themes / `bestFor` / discovery profile | Authored similarity | Computed qualification | Major remaining factual uncertainty |
| --- | --- | --- | --- | --- | --- | --- |
| Batman Unburied | David S. Goyer (`creator`, person); Warner Bros. (`production-company`, production-company) | Completed Drama | `—` / `—` / `—` / `voiceStyle=primarily-acted; narrativeFocus=plot-driven; intensity=medium` | 0 / 0 / 0 | Public 0; diagnostic 255 | No canonical public RSS; current Spotify ID resolves to Batman Unburied: Fallen City, so season-one/platform identity remains bounded by the Phase 1 gap. |
| Jackie the Ripper | Stak (`production-company`, production-company) | Completed shows; Comedy with a mystery; Completed Drama | `funny, dark` / `murder, investigation, gender` / `—` / `—` | 0 / 0 / 0 | Public 0; diagnostic 182 | No recorded provider gap. Stak is established as the production identity, while Joel Emery, Adam Jarrell, Finn Ranson, and Luke Moore remain ordinary credits rather than new creator links. |
| Fairies and Dragons, Ponies and Knights | Dirt Road Theater (`production-company`, production-company) | Fantasy detours and hidden worlds | `—` / `family, friendship, adventure` / `—` / `—` | 0 / 0 / 0 | Public 0; diagnostic 85 | No official Season 4, completion, or next-release statement; the three-person creator string remains compound and unresolved. |
| The Cleansed | FinalRune Productions (`production-company`, production-company); Fred Greenhalgh (`creator`, person) | Completed Sci-Fi; Completed Drama | `—` / `—` / `—` / `—` | 0 / 0 / 0 | Public 0; diagnostic 201 | No current research gap is recorded. Dagaz Media appears as owner metadata and should not be collapsed into FinalRune without a role-specific source. |
| The Orbiting Human Circus | WNYC Studios (`production-company`, production-company); Night Vale Presents (`production-company`, network); Julian Koster (`creator`, person) | Episodic Comedy | `—` / `—` / `—` / `—` | 0 / 0 / 0 | Public 0; diagnostic 129 | Lifecycle remains unclear. WNYC/Night Vale production roles and the new Julian Koster creator link are factual, but the role divergence is intentionally retained. |
| The Secret of St Kilda | Fable & Folly (`production-company`, network) | Cold isolation horror; Late-night tension; Folk horror and old gods | `—` / `—` / `—` / `—` | 0 / 0 / 0 | Public 0; diagnostic 168 | `Michael Ireland & Naomi Clarke` remains a compound creator string; Fable & Folly remains a network entity with a show-specific production role. |
| Two Flat Earthers Kidnap a Freemason | Good Pointe (`network`, production-company); Jeremy Ellett (`creator`, person) | Ongoing Sci-Fi; Ongoing Comedy | `—` / `—` / `—` / `—` | 0 / 0 / 0 | Public 0; diagnostic 370 | No distinct canonical Spotify listing; the previous shared URL was removed in Phase 1. Good Pointe's network relationship remains separate from platform evidence. |
| Rosanna's Secret | Goatshead Castle Productions (`production-company`, production-company) | None | `—` / `—` / `—` / `—` | 0 / 0 / 0 | Public 0; diagnostic 20 | No canonical show RSS; the general WordPress feed is not a show feed. Completion and the person/company boundary remain open beyond the production link. |
| Darkest Night | The Paragon Collective (`production-company`, production-company) | Episodic Horror | `—` / `—` / `—` / `—` | 0 / 0 / 0 | Public 0; diagnostic 193 | Factual source coverage is thin beyond the Libsyn feed; the organization credit is trustworthy but no person-level creator relationship is yet supported. |
| Within the Wires | Night Vale Presents (`network`, network); Joseph Fink (`creator`, person); Jeffrey Cranor (`creator`, person) | None | `—` / `—` / `—` / `—` | 0 / 0 / 0 | Public 0; diagnostic 292 | No active research gap is recorded. A collection route and editorial facets remain absent; network and creator roles should stay separate. |
| Our Fair City | Audacious Machine Creative (`production-company`, production-company) | Ongoing Sci-Fi | `—` / `—` / `—` / `—` | 0 / 0 / 0 | Public 0; diagnostic 172 | ART19 is hosting infrastructure, not an entity link. Audacious Machine Creative is source-backed production evidence; person-level creator attribution remains unresolved. |
| The Harrowing | Storyglass (`production-company`, production-company); Mark Healy (`creator`, person) | Completed Drama | `—` / `—` / `—` / `—` | 0 / 0 / 0 | Public 0; diagnostic 187 | The current Acast feed and Apple collection are empty or unavailable; current runtime evidence remains historical and should be rechecked if Storyglass restores the feed. |

These records are intentionally not enriched in Phase 2. The first Phase 3
batch should begin with the rows whose factual gap is bounded and whose
collection/entity context is already useful, while keeping the provider gaps
above visible during editorial review.

## 9. Validation record

### Passed

- `npm run build:catalog`
- `npm run build:pages`
- `npm run validate:data`
- `npm run report:entity-graph`
- `npm run report:entity-candidates -- --limit=120`
- `npm run report:provenance`
- `npm run report:discovery-quality`
- `npm run report:catalog`
- `npm run report:similarity -- --limit=3 --show=derelict`
- `npm run check:generated`
- `npm run check:structure` (exit 0; existing soft-limit warnings remain)
- `npm --prefix backend run test:catalog-integrity` — 7/7 passed
- `npm --prefix backend run test:entities` — 20/20 passed
- `npm --prefix backend run test:entity-candidates` — 3/3 passed
- `node --test backend/test/entity-graph-report.test.js` — 3/3 passed
- `git diff --check`

The two entity snapshot tests were updated only because their hard-coded source
counts represented the pre-Phase 2 graph. The test logic and source-only
behavior remain unchanged.

The report summaries were also consistent with the source graph: provenance
reported 752 published shows with 752 existing objective-source records (and
0 records using the separate explicit-provenance field); discovery quality
reported 517 imported/factual-only, 235 enrichment-eligible, and 7 editorial
shows; and similarity reported 234 authored links with 234 written reasons.

### Environment-limited tooling

`npm run test:tools` completed with 80 passing and 3 skipped tests, plus two
failures unrelated to catalog/entity behavior:

1. `tools/test/monitoring.test.js` invokes GNU `stat -c`, which is not valid
   for the macOS `stat` available in this environment.
2. `tools/test/operations.test.js` exercises a fixture that hard-codes
   `/usr/bin/node`, which does not exist on this host.

Those deployment/monitoring fixtures were not changed because this phase is
read-only with respect to deployment and no catalog/entity validation depends
on either platform assumption.

## 10. Worktree boundary

The pre-existing dirty work included 18 collection source records plus the
Oz-9 and White Vault show/review records and their generated mirrors. Those
files were not overwritten or “cleaned up.” Phase 2 authored changes are
limited to `catalog-src/entities.json`, the 10 show records listed in the
resolution table, the two stale graph-count test snapshots, and this QA
report. Nothing was committed or published.
