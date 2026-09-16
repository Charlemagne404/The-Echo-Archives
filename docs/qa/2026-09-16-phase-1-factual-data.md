# Phase 1 factual data review — 2026-09-16

## Scope and method

This pass covers factual identity, provider correctness, objective counts/runtime data, lifecycle facts directly exposed by the reviewed sources, and existing Gate B blockers. The authored source of truth is `catalog-src/`; generated `data/` and `docs/generated/` output was not regenerated or published because the worktree already contained unrelated and parallel changes.

No tones, themes, `bestFor`, similarity links, archive ratings, archive takes, reviews, or other subjective editorial fields were added. Where a provider or source could not establish a fact, the uncertainty was retained in `metadata.researchGaps` and/or `metadata.import.externalResearch.uncertainFields`.

The review followed `data/schema.md`, `docs/IMPORTER.md`, `docs/CREATORS.md`, and the Gate B logic in `backend/lib/discovery-gaps.js`. Runtime summaries use the existing catalog convention: episode-level durations are rounded to whole minutes for min/median/average/max and observed totals to one decimal hour.

## Baseline before edits

The pre-change `npm run report:catalog` result was:

- 752 published shows, 46 collections, and 7 review companions.
- 6 missing RSS links; 2 actionable RSS gaps.
- 22 documented research-gap records.
- 10 Phase 2 / Gate B blocking errors.
- Blockers were the missing creators for Orbiting and Claudia; undocumented RSS gaps for Batman and Rosanna; undocumented runtime gaps for Batman, Wormwood, Parkdale, The Harrowing, and The Sojourn; and Twilight Histories being classified out of scope by the role-playing text.

The worktree was already dirty before this pass. Existing changes outside the targeted source records were preserved.

## Record ledger

### The Magnus Archives

- Old: `length.episodes=383`, `episodeCounts.full=383`, `observedSeasons=[8,7,5,4,3,2,1]`, `minEpisodeMinutes=1`, `maxEpisodeMinutes=94`, `totalObservedHours=155.9`, and `latestFeedItem=2026-07-30`.
- New: `episodes=200`, `episodeCounts={full:200, bonus:54, trailer:1}`, `observedSeasons=[1,2,3,4,5]`, `min=16`, `max=37`, `totalObservedHours=79.3`, and `latestFeedItem=2021-03-25`.
- URLs: RSS, Spotify, and Apple URLs were intentionally retained. The current Acast feed, Spotify show ID, and Apple collection are shared provider identities for this record and The Magnus Protocol; no standalone Protocol feed was invented.
- Evidence: [Rusty Quill show page](https://rustyquill.com/show/the-magnus-archives/), [Rusty Quill Protocol page](https://rustyquill.com/show/the-magnus-protocol/), [shared Acast feed](https://feeds.acast.com/public/shows/b6085bcd-3542-4a43-b6a8-021e3fd251b8), [shared Spotify show](https://open.spotify.com/show/5pwBAjuJJAOt7cED5Lkjnk), and [Apple collection](https://podcasts.apple.com/us/podcast/the-magnus-archives/id1095138637).
- Justification: the live feed contains the numbered `MAG 1`–`MAG 200` episodes plus 55 non-numbered MAG extras. The core count/runtime/date fields now use only the numbered main-series items; the later shared-feed items are not treated as Magnus Archives episodes.
- Remaining uncertainty: the feed does not provide a clean separate provider collection for the two franchise records, and its non-numbered auxiliary items are retained only as non-core counts.

### The Magnus Protocol

- Old: `length.episodes=383`, `episodeCounts.full=383`, shared-feed seasons `[8,7,5,4,3,2,1]`, `min=1`, `max=94`, `totalObservedHours=155.9`, and `latest/latestFeedItem=2026-07-30`.
- New: `episodes=55`, `episodeCounts={full:55, bonus:4, trailer:3}`, `observedSeasons=[1,2]`, `min=17`, `max=42`, `totalObservedHours=22.3`, and `latest/latestFeedItem=2026-09-10`.
- URLs: the shared Acast RSS, Spotify show ID, and Apple collection were retained as intentional franchise/provider identity links.
- Evidence: [Rusty Quill Protocol page](https://rustyquill.com/show/the-magnus-protocol/), [Rusty Quill Archives page](https://rustyquill.com/show/the-magnus-archives/), [shared Acast feed](https://feeds.acast.com/public/shows/b6085bcd-3542-4a43-b6a8-021e3fd251b8), [shared Spotify show](https://open.spotify.com/show/5pwBAjuJJAOt7cED5Lkjnk), and [Apple collection](https://podcasts.apple.com/us/podcast/the-magnus-archives/id1095138637).
- Justification: the live feed contains numbered Protocol episodes 1–55, four additional full-tagged Protocol items, and three trailers. Raw feed seasons 7 and 8 were normalized to the official Protocol seasons 1 and 2 rather than exposing the shared-feed numbering.
- Remaining uncertainty: a separate public Protocol RSS/Apple/Spotify identity was not verified; current feed dates are time-sensitive.

### Batman Unburied

- Old: `creators=["Spotify / Warner Bros. / DC"]`, the same compound `credits.creatorName`, no RSS, no episode count/runtime, and only a generic Fallen City research gap.
- New: `creators=["David S. Goyer"]`; credits now separate David S. Goyer as creator/writer/executive producer, Warner Bros. as `productionCompany`, and Spotify as `distributor`. Length is `1 season`, at least 10 full episodes, 29-minute median, 21–42 minute range, 4.8 observed hours, with full-duration coverage.
- RSS/provider URLs: no RSS or Apple URL was added. The existing Spotify ID remains the only verified platform entry, but is explicitly documented as the current `Batman Unburied: Fallen City` page.
- Evidence: [current Spotify page](https://open.spotify.com/show/3pUWoZ6fC2qA02D3X0CeMb), [Spotify launch announcement](https://newsroom.spotify.com/2020-09-29/david-goyer-warner-bros-and-dc-set-to-bring-batman-unburied-to-spotify/), [Spotify production announcement](https://newsroom.spotify.com/2022-04-05/the-batman-unburied-audio-series-is-ready-to-take-flight-across-the-world-in-spotifys-largest-simultaneous-launch/), [DC announcement](https://www.dc.com/blog/2020/09/29/david-s-goyer-warner-bros-and-dc-set-to-bring-batman-unburied-to-spotify), and [DC follow-up](https://www.dc.com/blog/2022/05/26/digging-up-batman-unburied).
- Runtime method: ten official Spotify episode pages were checked: [1](https://open.spotify.com/episode/5dEdBTgfq9cR7Il2sLflJu), [2](https://open.spotify.com/episode/5DslvygOFIDXLlG3CuoF2b), [3](https://open.spotify.com/episode/1Sg4A71ufxgwMRMgdBh8YQ), [4](https://open.spotify.com/episode/6xGKPIU9vr1K1rbPZykmFe), [5](https://open.spotify.com/episode/0MgVD1lUZFMWd6T0eYfiuv), [6](https://open.spotify.com/episode/4mcWNREd2U9jBI6RCKVljJ), [7](https://open.spotify.com/episode/3g2d4I8n1OENQsicJvC67J), [8](https://open.spotify.com/episode/1LyMW3hFeVRYGLyturYbBE), [9](https://open.spotify.com/episode/7rmnAVNxuuIjJsrxc92Xyu), and [10](https://open.spotify.com/episode/2m8aNKQjQdcQwS2jgu0gwP).
- Remaining uncertainty: the current Spotify show page is the Fallen City continuation/rebrand and no canonical public RSS or separate original-season Spotify show URL was found. The ten-episode count/runtime must not be read as the later Fallen City total.

### Parkdale Haunt

- Old: Apple URL used the Parkdale title, `episodes=74`, no runtime, and all episode-count buckets were zero.
- New: Apple URL is the current stable-ID collection [Woodbine: A Parkdale Haunts Production](https://podcasts.apple.com/us/podcast/woodbine-a-parkdale-haunts-production/id1532573147?uo=4). Length is restricted to feed seasons 1–3: at least 33 full, 4 bonus, and 7 trailer items; 39-minute average, 38-minute median, 23–56 minute range, 21.2 observed hours. `latestFeedItem` is `2023-10-27`; release/completion status remains unknown/unclear.
- Credits: Realm was added as the distributor; Emily Kellogg and Alex Nursall remain the co-creator string.
- Evidence: [Parkdale about page](https://parkdalehaunt.com/about/), [official episode guide](https://parkdalehaunt.com/episodes/), [shared Megaphone feed](https://feeds.megaphone.fm/SBP6646870521), [current Apple collection](https://podcasts.apple.com/us/podcast/woodbine-a-parkdale-haunts-production/id1532573147?uo=4), and [current Spotify identity](https://open.spotify.com/show/6hfxah5I0URgwr67uVhnpN).
- Justification: the live Megaphone feed is titled Woodbine and contains Parkdale seasons 1–3 followed by Woodbine seasons 4–6. Counts/runtime use only the Parkdale season values; the official Parkdale episode guide confirms the Parkdale episode boundary and postmortem items.
- Remaining uncertainty: the provider pages do not expose separate Parkdale and Woodbine records, so the shared IDs and title mismatch remain documented rather than treated as a canonical-title replacement.

### Rosanna's Secret

- Old: RSS was blank with no Gate B-recognized RSS gap; `Goatshead Castle Productions` was placed in both creator and network roles.
- New: RSS remains blank; a specific `metadata.researchGaps` entry documents that no canonical show RSS was found. `Goatshead Castle Productions` is retained as creator/production company and removed from the network role.
- Evidence: [official Rosanna's Secret page](https://samanthavhutton.com/podcast/rosannas-secret-2/), [official YouTube series playlist](https://www.youtube.com/playlist?list=PLQHiDb_oo19OUDZ83ovUHm36acdM2degU), [Spotify episode](https://open.spotify.com/episode/5yzy8xOszgpVCKRKM6Okr4), and [general site RSS](https://samanthavhutton.com/feed/).
- Justification: the official page and Spotify copyright support Goatshead Castle Productions; the WordPress feed is a general site feed and is not presented as the show's feed.
- Remaining uncertainty: Spotify's artist metadata uses the variant `Goatshead Castle Creations`; completion status and a canonical show RSS remain unresolved.

### Wormwood: A Serialized Mystery

- Old: 171 full episodes, no detailed season/runtime fields, and `durationCoverage=0`.
- New: three observed seasons, at least 70 full narrative episodes, 24 non-core audio items, 28-minute average, 27-minute median, 9–51 minute range, 32.8 observed hours, and full-duration coverage.
- Evidence: [official episode guide](https://wormwoodshow.com/episodes/), [official site](https://wormwoodshow.com/), [FeedBurner feed](https://feeds.feedburner.com/WormwoodPodcast), and [Apple listing](https://podcasts.apple.com/us/podcast/wormwood-a-serialized-mystery/id261086208?uo=4).
- Justification: the feed has 171 WordPress posts but only 94 audio enclosures. Seventy audio enclosures match the narrative runs in the official guide; their official MP3 enclosure headers provide durations. The other 24 audio enclosures are not counted as full narrative episodes.
- Remaining uncertainty: neither RSS nor Apple exposes usable duration tags, and the 24 auxiliary items are not consistently typed by the feed.

### The Harrowing

- Old: no episode count/runtime and no documented runtime uncertainty.
- New: at least 8 full episodes, 3 historical trailers, 32-minute average/median, 23–44 minute range, 4.3 observed hours, and full-duration coverage. A non-blocking gap now records that the current Acast feed and Apple collection are empty/unavailable.
- Evidence: [official Robert Delamere production page](https://robertdelamere.co.uk/productions/?i=52), [current Acast page](https://shows.acast.com/the-harrowing), [current RSS URL](https://feeds.acast.com/public/shows/2c1c6fc3-d27b-481e-b2c0-1d8d3f6ee890), [historical Listen Notes record](https://www.listennotes.com/podcasts/the-harrowing-storyglass-1Plw7G8WEZg/), and [historical E8 capture](https://www.listennotes.com/podcasts/undertow-familiar/the-harrowing-e8-G-Y5uqA2B6T/).
- Justification: the current provider surfaces returned no usable episode list; historical episode captures supply E1–E8 runtimes and three trailers. Storyglass/Mark Healy credits remain supported by the official production page.
- Remaining uncertainty: the runtime is historical secondary evidence, including E8 from a separate indexed page, and should be rechecked if Storyglass restores the feed.

### The Sojourn

- Old: `completed/finished`, 21 episodes with no full-episode count/runtime, and a truncated RSS research gap.
- New: `active/ongoing`; at least 18 released full episodes, 40-minute average, 41-minute median, 25–59 minute range, 11.9 observed hours, and full-duration coverage. The announced Season Two Volume Three episodes 7–9 are excluded until released.
- Evidence: [official home](https://www.thesojournaudiodrama.com/), [Season One guide](https://www.thesojournaudiodrama.com/s01), [Season One Volume One](https://www.thesojournaudiodrama.com/s01v01), [Season One Volume Two](https://www.thesojournaudiodrama.com/s01v02), [Season Two Volume One](https://www.thesojournaudiodrama.com/s02v01), [Season Two Volume Two](https://www.thesojournaudiodrama.com/s02v02), and [Season Two Volume Three announcement](https://www.thesojournaudiodrama.com/s02v03).
- Justification: official pages describe store/audiobook-retailer delivery and Spotify collections, not a podcast-RSS release. The runtime uses the 18 released episode runtimes on the official volume pages; the no-RSS condition is documented rather than treated as a missing provider URL to fabricate.
- Remaining uncertainty: the three announced Volume Three episodes have no released runtime/count contribution yet.

### The Orbiting Human Circus

- Old: no creator and `credits.creatorName=[]`; WNYC Studios and Night Vale Presents were present only in the owner string and production-company links.
- New: creator is `Julian Koster`; writer/director fields and a non-directory `julian-koster` person entity were added. WNYC Studios and Night Vale Presents remain separate production-company relationships.
- Evidence: [official WNYC team page](https://www.wnycstudios.org/podcasts/orbitinghumancircus/the-team), [official WNYC show page](https://www.wnycstudios.org/podcasts/orbitinghumancircus), [Simplecast feed](https://feeds.simplecast.com/zXrWS5lU), and [Apple listing](https://podcasts.apple.com/us/podcast/the-orbiting-human-circus/id1158759190).
- Justification: the official team page identifies Koster as author, writer, director, and lead actor; the official show material identifies WNYC Studios and Night Vale Presents as the co-production entities. The provider owner string was not promoted to creator.
- Remaining uncertainty: lifecycle remains unknown/unclear as before.

### Claudia: A Viral Love Story

- Old: no creator and `credits.creatorName=[]`; Profile Theatre was linked only as a production company.
- New: creator and production company are both `Profile Theatre`; imported verification workflow status remains unchanged.
- Evidence: [official Profile Theatre Claudia page](https://profiletheatre.org/claudia/), [Profile Theatre about page](https://profiletheatre.org/about-us/), [Castos feed](https://feeds.castos.com/ox85), and [Apple listing](https://podcasts.apple.com/us/podcast/claudia-a-viral-love-story/id1518857050).
- Justification: Profile Theatre describes Claudia as its first audio play and identifies the theatre's commissioning/presenting relationship; the existing Profile Theatre production-company entity is retained. The nine writers were not recast as a single creator.
- Remaining uncertainty: lifecycle remains unknown/unclear.

### Twilight Histories

- Old: description included `role-playing`, and the research gap preserved a directory Games label; Gate B therefore classified the published record as out of scope.
- New: the description and imported official summary now use the source-backed “immersive alternate-history audio fiction” wording; the scope gap was closed.
- Evidence: [official Twilight Histories site](https://twilighthistories.com/) and [Apple listing](https://podcasts.apple.com/us/podcast/twilight-histories/id475159941).
- Justification: authoritative sources describe the work as audio fiction/audio drama. “Role-playing” is used as a story element, not as evidence of actual play, TTRPG, or tabletop gameplay. Under the existing locked policy, the record remains in scope; no scope rule was changed and no tags/genres were enriched.
- Remaining uncertainty: none for the current scope classification; lifecycle remains as previously recorded.

### Provider collision: Subjective Truth / Two Flat Earthers

- `The Subjective Truth` keeps Spotify show `1SD31t3fcAol2CTY8670ea`.
- `Two Flat Earthers Kidnap a Freemason` had the same Spotify URL removed and now documents the unresolved absence of a distinct canonical Spotify listing. Its Apple ID and Megaphone feed remain unchanged and distinct.
- Evidence: [Good Pointe](https://goodpointepodcasts.com/), current [Spotify page](https://open.spotify.com/show/1SD31t3fcAol2CTY8670ea), [Subjective Truth Apple record](https://itunes.apple.com/lookup?id=1476957977&entity=podcastEpisode&limit=200), and [Two Flat Apple record](https://itunes.apple.com/lookup?id=1582700456&entity=podcastEpisode&limit=200).
- Classification: Good Pointe's shared website/publisher relationship is legitimate; the shared Spotify URL was an incorrect canonical link for Two Flat and is now unresolved rather than guessed.

### Provider collision: The Harrowing of Minerva Damson / Route 6.6

- `The Harrowing of Minerva Damson` keeps Spotify show `2i1BSgfNBaQkqCIlUu3EGx` because the current Spotify page identifies Minerva.
- `Route 6.6` had the shared Spotify URL removed and now documents the absence of a distinct canonical Spotify listing. Its Acast feed and Apple ID remain unchanged and distinct.
- Evidence: current [Minerva Spotify page](https://open.spotify.com/show/2i1BSgfNBaQkqCIlUu3EGx), [Route 6.6 Acast page](https://shows.acast.com/route6point6), [Route 6.6 Apple record](https://itunes.apple.com/lookup?id=1763626837&entity=podcastEpisode&limit=200), and [Minerva Acast page](https://shows.acast.com/the-harrowing-of-minerva-damson).
- Classification: Goblin Booth Productions is a legitimate shared production identity; the Spotify link was incorrect for Route 6.6 and is now unresolved.

### Provider collision: Thieves Guild / Artifacts of Arcane

- No source record was changed. The two shows have distinct Omny RSS feeds and distinct show titles; both use Podcast Alchemy Studio's website and Jake Kerr credit.
- Evidence: [Podcast Alchemy Studio](https://podcastalchemy.studio/), [Thieves Guild RSS](https://www.omnycontent.com/d/playlist/3082f102-29e2-476c-974b-a78d001c3a4c/c089ddae-1de6-4047-bef1-b45a00ce7ad8/a938be82-8a9a-4943-915e-b45a00ce7ae4/podcast.rss), and [Artifacts of the Arcane RSS](https://www.omnycontent.com/d/playlist/3082f102-29e2-476c-974b-a78d001c3a4c/f6949134-0054-4373-bbe0-b45b00052a91/88098cd8-8c7f-4b6f-a6cb-b45b00052a9c/podcast.rss).
- Classification: legitimate shared publisher/website relationship. The shared website was not promoted to a new entity because the current creator policy requires explicit production/entity evidence beyond a site link.

## Validation and reports

The following commands were run after the source edits:

```text
npm run validate:data
npm run report:provenance
npm run report:entity-graph
npm run report:discovery-quality
npm run report:catalog
```

No dedicated provider-collision command existed in the repository. A read-only collision check was rerun over authored `listenLinks` for exact normalized RSS/Spotify/Apple/website URLs.

Results:

- `npm run validate:data`: passed. 752 shows, 46 collections, 123 entities, and 7 review companions; 0 content-integrity errors. Existing entity type/role warnings remain and were not broadened in this pass.
- `npm run report:provenance`: passed. 752 published shows and 752 existing objective-source records; this report still shows 0 explicit provenance records because the repository's provenance field is separate from the legacy-compatible objective-source evidence.
- `npm run report:entity-graph`: passed on authored source. 123 entities, 307 known relationship records, 60 creator-role shows, 157 production-company relationships, 0 unknown references, and 0 invalid relationship records. Julian Koster is linked in `catalog-src`; the report is the authoritative check for this source pass.
- `npm run report:discovery-quality`: passed as a read-only report. It reads `data/shows.json`, so it still reports 122 entities/306 edges and lists Julian Koster as unlinked until generated output is deliberately rebuilt.
- `npm run report:catalog`: passed with `Phase 2 / Gate B: complete`, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, 0 editorial gaps, and 0 taxonomy errors. It reports generated `shows`, `search-index`, and `catalog-status` output as stale; collections remained in sync.

### Gate B before/after

| Measure | Before | After |
| --- | ---: | ---: |
| Phase 2 / Gate B blocking errors | 10 | 0 |
| Missing RSS links | 6 | 6 |
| Actionable missing RSS gaps | 2 | 0 |
| Documented research-gap records | 22 | 25 |
| Editorial gaps | 0 | 0 |
| Taxonomy unknown/non-approved tags | 0 | 0 |

The six missing RSS links are therefore all documented or deliberately outside the podcast-RSS model; this pass did not fabricate feeds for Batman, Rosanna's Secret, or The Sojourn.

### Provider collision before/after

The named collision states after the edit are:

- Magnus Archives / Magnus Protocol: three intentional shared provider identities remain (same RSS, Spotify show, and Apple collection), with separate series counts and dates.
- Subjective Truth / Two Flat Earthers: the shared Spotify URL existed before; it remains only on Subjective Truth and was removed from Two Flat Earthers. Their Good Pointe website is a legitimate shared publisher relationship.
- Minerva Damson / Route 6.6: the shared Spotify URL existed before; it remains only on Minerva and was removed from Route 6.6. Their Goblin Booth creator/production identity is legitimate and distinct from provider identity.
- Thieves Guild / Artifacts of the Arcane: the shared Podcast Alchemy Studio website remains; their Omny RSS feeds are distinct, so this is a legitimate shared publisher/website relationship.
- Four unrelated Podbean login URLs still normalize to one login host; they are pre-existing infrastructure/login artifacts and were not changed.

The post-change read-only scan found 7 normalized listen-link collision groups: the 3 intentional Magnus provider groups, the Good Pointe start/website groups, the Podcast Alchemy website group, and the unrelated Podbean login group. The two incorrect named Spotify collisions are no longer present.

## Phase 2 implications

- The target Gate B blockers are factual rather than editorial; no broad enrichment should be inferred from this pass.
- Generated catalog artifacts still need a deliberate rebuild/review after these authored changes. That rebuild was intentionally deferred to avoid overwriting unrelated dirty generated output.
- Batman's current Spotify/Fallen City identity, Parkdale/Woodbine's shared provider identity, Rosanna's absent RSS, The Harrowing's empty current feed, and The Sojourn's store-based delivery should remain visible to Phase 2 reviewers.
- The provider-collision check should continue treating shared publisher websites as relationships, not canonical provider identity, and should not turn hosting infrastructure into creators or production entities.
