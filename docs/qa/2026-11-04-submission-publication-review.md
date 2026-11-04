# Submission publication review — 2026-11-04

## Scope and evidence boundary

This review refreshes the source evidence in the publication package prepared on
2026-11-01. The live catalogue currently exposes 752 shows. Public catalogue
matching finds one existing title, **Polybius Protocol** (`polybius-protocol`);
the other eight source-reviewed candidates have no exact or normalized
title/creator match in the public catalogue. This is not production importer
queue matching. The restricted production queue could not be queried from this
session because the publisher requires the authorized host runner and
noninteractive `sudo` is unavailable.

The source and identity review below is current through 2026-11-04. The
publisher must still make a fresh production plan, resolve each submission ID
against its actual target candidate, show the current evidence and catalogue
identity matches, and reject any changed or ambiguous entry. The package's
local candidate IDs are not production IDs. No production queue, database,
catalogue, or review stamp was changed by this review.

## Release and workflow state

The production service and staging service were healthy when checked, both
serving commit `02fcbd2a676033bbf9d54ce613d4ba1362ec10b7` with application
package version `2.0.0`. The public footer still showed `v1.2.7`, and the live
submission form still used the browser's default GET method. The current source
fixes both behaviors; neither fix is deployed yet.

The recent publication/release fixes are present in the local branch history:
the release-marker symlink check (`2e003d6f`), publisher staging ownership
handling (`02fcbd2a`), catalogue journal placement in writable staging
(`8a3a4b2b`), and read-only recovery plus submission fallback (`aba4da09`).
The deploy workflow remains the documented build, private-staging, smoke,
promotion, and health-check path. This session cannot run the privileged host
steps: noninteractive `sudo -n -l` reports that a password is required. No
authorization boundary or release gate was bypassed.

The latest host monitor passed local backup integrity and SQLite foreign-key
checks. It reported the offsite backup timer disabled and `/run/reboot-required`
present. The local backup timer is active. The offsite prerequisite and pending
reboot need deliberate host attention, but neither was changed during this
release review.

## Candidate decisions

| Candidate | Source-backed identity | Public catalogue match | Confidence and remaining uncertainty | Decision |
| --- | --- | --- | --- | --- |
| Don’t Stop Me Now – An Audiobook Podcast | Roo Bannister; [official Acast page](https://shows.acast.com/dont-stop-me-now-an-audiobook-podcast) and [Acast feed](https://feeds.acast.com/public/shows/6a5cc087740ca41b5abe6ff6) agree on the exact show and host. | None found. | High title/creator/feed identity. The current feed has six entries; episode count, release status, and completion remain unknown because these can change and no completion claim is established. | Source-eligible for a new indexed-only listing after the production plan confirms no duplicate. Use the Echo placeholder cover. |
| Mina – An Audiobook Podcast by Roo Bannister | Roo Bannister; [Acast](https://shows.acast.com/mina-an-audiobook-podcast-by-roo-bannister), its [RSS feed](https://feeds.acast.com/public/shows/6a4264183fa89e333892b6ae), and [Apple Podcasts](https://podcasts.apple.com/gb/podcast/mina-an-audiobook-podcast-by-roo-bannister/id6785521340) support the title, feed, and creator. | None found. | High title/creator/feed identity. The explicit-content advisory conflicts between Acast/Apple lookup data and the GB Apple listing. This is a real disagreement in optional metadata; keep the advisory unknown. Episode count, release status, and completion remain unknown. | Source-eligible for a new indexed-only listing after production matching. The optional advisory conflict does not block publication when it remains unknown. Use the Echo placeholder cover. |
| Dyme: An Appalachian Horror Audio Drama | Devin J. Bates; the [RSS.com show page](https://rss.com/podcasts/the-dyme-podcast/), [current RSS feed](https://media.rss.com/the-dyme-podcast/feed.xml), [Apple Podcasts](https://podcasts.apple.com/us/podcast/dyme-an-appalachian-horror-audio-drama/id6807107677), and [Spotify](https://open.spotify.com/show/2Q5n8Lq3UcymvYgaSATEI8) identify the same show. Two submissions are duplicates of this one candidate. | None found. | High title/creator/feed identity. Current feed entries changed since the package snapshot, so exact episode count and completion remain unknown. A provider-owned Facebook account was incorrectly extracted as a show social link by the old adapter; the importer fix now omits social links from podcast-host pages. | Source-eligible for one new indexed-only listing after production matching. Use the Echo placeholder cover; do not add RSS.com’s social account. |
| Richian Presents: Dracula | Richian Studios; the [official series page](https://richian.ai/dracula), [Transistor feed](https://feeds.transistor.fm/richian-presents-dracula), and [Apple Podcasts](https://podcasts.apple.com/us/podcast/richian-presents-dracula/id6817647404) corroborate title and producer. | None found. | High identity. The current feed includes a trailer as well as episodes, so exact episode count is unknown. Release and completion remain unknown. | Source-eligible for a new indexed-only listing after production matching. Use the Echo placeholder cover. |
| Polybius Protocol | Children of the Neon God; the [official site](https://polybiusprotocol.com/), [RSS feed](https://anchor.fm/s/107b6a17c/podcast/rss), and [Apple Podcasts](https://podcasts.apple.com/us/podcast/polybius-protocol/id1829330145) corroborate the existing show identity. | Exact existing match: `polybius-protocol`. | High identity. The reviewed source update is 10 to 11 episodes. Preserve the existing review tier, ratings, editorial content, tags, collections, creator fields, and other human-managed data. | Source-eligible as an update to the exact existing record only. Publish the reviewed factual delta after the production plan confirms the same target and preserved fields. |
| The Great Work and Other Administrative Matters | A.A.T. Studios; the [official listen page](https://aatstudios.com/listen-the-opus), [RSS feed](https://anchor.fm/s/11625e9ac/podcast/rss), and [Apple Podcasts](https://podcasts.apple.com/us/podcast/the-great-work-and-other-administrative-matters/id6803411634) agree on the exact title. | None found. | High title/feed identity. The former publisher-homepage title signal was correctly identified as the studio name, not a competing show title. If the production plan still requires title evidence selection, select the exact RSS title and retain Apple as corroboration. Other optional release/count fields remain unknown. | Source-eligible for a new indexed-only listing after production matching and any exact evidence selection reported by the plan. Use the Echo placeholder cover. |
| Welcome to the Brass Eagle | Connor Bushoven; the [official site](https://www.brasseaglepod.com/), [RSS feed](https://anchor.fm/s/f84a2fec/podcast/rss), [Apple Podcasts](https://podcasts.apple.com/us/podcast/welcome-to-the-brass-eagle/id1755019783), and [Spotify](https://open.spotify.com/show/2iDR1ePD9T3b5f1ATGHoB4) corroborate the title and creator. | None found. | High identity. The official site currently lists four full story episodes and describes a ten-episode story, while the feed also carries mini episodes and a promotional item. Do not present the feed item count as story episode count; keep the count unknown. | Source-eligible for a new indexed-only listing after production matching. Use the Echo placeholder cover. |
| The Chronicles of Oz | Crossover Adventure Productions; the [official site](https://chroniclesofoz.com/), [Apple Podcasts](https://podcasts.apple.com/us/podcast/the-chronicles-of-oz/id347552849), and [Libsyn feed](https://rss.pdrl.fm/6e3be2/feeds.libsyn.com/119246/rss/?redirect=false) corroborate the title and publisher. | None found. | High identity. The current official site says three complete seasons and two specials are available, with season four coming soon. Do not mark the whole show complete or publish a stale feed-entry count; keep optional completion/count fields unknown. | Source-eligible for a new indexed-only listing after production matching. Use the Echo placeholder cover. |
| Parson’s Nose Radio Theater | Lance Davis is the creator shown by [Apple Podcasts](https://podcasts.apple.com/us/podcast/parsons-nose-radio-theater/id1512026025) and the [Anchor RSS feed](https://anchor.fm/s/1ff5a5f4/podcast/rss). The [official theater history](https://parsonsnose.com/our-history/) says the company created the Radio Theater and continues the podcast. | None found. | High show and creator identity. Current feed activity and Apple identity corroborate the active show; its total feed count can change and remains unknown. | Source-eligible for a new indexed-only listing after production matching. Use the Echo placeholder cover. |

## Held candidate

**OPTOg** is excluded from the eligible set. ShortWave’s [official PINGs page](https://shortwave.studio/optog/) supports the audio-fiction project and the [Amazon Music listing](https://music.amazon.co.uk/podcasts/3c2ab8bc-6eda-429e-b320-01d6bdcf5a61/optog) is a plausible external identity, but no stable RSS, Apple, or Podcast Index identity corroborates it. The Amazon page does not independently establish the exact displayed creator/description in the evidence available here. This is an unresolved external identity and creator-description match, not missing optional metadata. The authenticated maintainer must confirm the exact Amazon listing, title **OPTOg**, creator **Yuta Hayakawa / ShortWave.STUDIO**, and the submitted description before that identity is verified or the show is considered.

## Publication safeguards

- New shows use the `indexed-only` review tier. The existing Polybius record keeps its current tier and human-managed editorial fields.
- The nine external cover images have no documented publication permission in the source package. Use `images/Circle2-Logo-S.png` for new records; retain Polybius’s existing artwork. Do not publish an external cover unless rights are established.
- Leave unknown release status, completion, exact episode count, and Mina’s conflicting explicit-content advisory unknown. None is required for an otherwise source-supported listing.
- The local candidate snapshot was prepared on 2026-11-01. Rechecked feed counts can change and are not exact show totals; apply only currently supported, explicitly qualified observed counts, and leave stale or unqualified totals unknown. The current plan must also omit provider-owned social links such as RSS.com’s Facebook account.
- The local package reports nine technically ready candidates and one `needs-review` candidate, but its `factsReviewedAt` values are blank and it has no production candidate IDs. A local `ready` status is not a production eligibility result.
- The prepared package contains ten entries. Before applying, the restricted plan must show the nine source-reviewed entries above as eligible actions (eight new listings and one Polybius update to `polybius-protocol`) and OPTOg as blocked for its unresolved external identity. It must show no duplicate catalogue matches, no other identity conflicts, and only the documented optional unknowns. Stop and re-review if targets, status, or prepared fields differ.
- A production apply must record the current factual review through the restricted publisher, preserve its exact plan hash, write an immutable receipt/journal, and pass post-publication public-site verification. No publication has occurred yet.

