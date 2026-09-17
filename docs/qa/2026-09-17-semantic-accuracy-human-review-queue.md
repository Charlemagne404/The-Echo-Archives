# HUMAN REVIEW QUEUE — Phase 3 semantic accuracy audit

This queue contains 36 published, enrichment-eligible records whose discovery
metadata is not trustworthy enough to leave entirely to automated inference.
It is intentionally conservative: a queue entry is not a claim that the
current value is wrong, only that the current evidence packet does not defend
the value strongly enough for unattended publication.

## Structure, format, and presentation

| Show | Suspicious field(s) and current value | Why it may be wrong | Missing evidence | Human verification action |
| --- | --- | --- | --- | --- |
| The Awkward Screw | `formats: episodic` | Multi-part Wishbone material and a continuing season quest may make the feed serial or hybrid rather than independently episodic. | Complete season map and episode descriptions. | Decide whether cases resolve independently, continue across episodes, or require both labels. |
| Attention HellMart Shoppers! | `formats: episodic` | Recurring staff and multi-part episode material can be mistaken for standalone episodes. | Full official episode list and representative transcripts/audio. | Classify case-based, serialized, anthology, or hybrid structure. |
| Afflicted | `formats: serialized, full-cast, episodic` | The four-label combination may be carrying delivery shape and story structure at once. | Season/episode arc map and official format statement. | Keep only labels that describe the listening experience and resolve whether `episodic` adds useful meaning. |
| Camlann | `formats: full-cast, serialized, episodic` | A recurring quest/season arc may not be episodic in the listener-facing sense. | Multiple season episode descriptions and representative audio. | Determine whether this is serialized, episodic-with-arc, or a different hybrid. |
| Darkest Night | `formats: episodic, anthology` | The anthology label is supported, but the hidden master conspiracy and unrelated feed drops make the serial boundary unclear. | Clean authoritative episode list, season grouping, and transcripts/audio. | Confirm anthology-only versus anthology with an overarching serial frame. |
| Doctor Who: Redacted | `formats: serialized, full-cast, episodic` | Individual chapter premises may have been treated as independent episodes even though the season is continuous. | Official season synopsis and episode-by-episode arc evidence. | Keep or remove `episodic` based on how episodes function, not their titles. |
| Fairies and Dragons, Ponies and Knights | `formats: serialized, episodic` | A long recurring-character story may be serial despite short individual premises. | Complete season structure and representative episode descriptions. | Verify whether the hybrid labels are intentional and useful. |
| Hi Nay | `formats: serialized, episodic`; `voiceStyle` absent | Ongoing characters and multi-season supernatural arcs support a hybrid, but the exact structure and presentation style remain unverified. | Representative audio/transcripts and season/episode map. | Confirm hybrid structure and add voice style only if the dominant presentation is clear. |
| King Falls AM | `formats: full-cast, serialized, episodic` | Long-running continuity and town arcs make the episodic label potentially misleading. | Official archive, season map, and representative episodes. | Distinguish serialized radio continuity from case-based episode independence. |
| The Black Tapes | `formats: narrated, episodic, serialized` | The show is serialized, but `episodic` may be inherited from feed delivery rather than story structure. | Official episode/season structure and representative transcripts. | Decide whether to retain the hybrid label or remove `episodic`. |
| The Cellar Letters | `formats: episodic` | Ongoing letters and investigation language suggest serial continuity; the current feed also needs source hygiene review. | Trustworthy official episode index and multiple episode descriptions/transcripts. | Verify serial, episodic-with-arc, or anthology status. |
| The Earth Collective | `formats: serialized, narrated, episodic` | The current labels mix a continuing narrative, presentation mode, and likely feed shape. | Season arc documentation and representative audio/transcripts. | Decide whether `episodic` describes the actual listening experience and whether narrated remains dominant. |
| The Grey Rooms | `formats: full-cast, anthology, serialized, episodic` | Four labels conceal whether this is an anthology, a serialized framing story, case-based episodes, or all three. | Official season structure and a sample of stories plus framing episodes. | Replace the broad bundle with the smallest defensible taxonomy. |
| The Liminal Lands | `formats: serialized, episodic` | The feed follows a continuous missing-family journey, but chapter-level pacing may still be episodic. | Representative transcripts/audio and a season/arc map. | Confirm hybrid status and whether the current narrative/profile fields describe the whole run. |
| The McIlwraith Statements | `formats: episodic, narrated, serialized` | Statements may resolve as cases while the IPP investigation continues; the current four-way distinction is uncertain. | Full statement/season map and representative transcripts/audio. | Decide case-based versus serial hybrid and whether narrative focus should change. |
| The Radio Adventures of Dr. Floyd | `formats: episodic, serialized` | Recurring characters and a finished long run do not by themselves establish serial dependency. | Official episode guide and representative adjacent-episode comparisons. | Verify independent adventures versus an overarching serialized story. |
| The Rapscallion Agency | `formats: serialized, episodic` | Episode-level missions may be independent within a continuing agency plot. | Official season/episode descriptions and representative audio. | Confirm whether `episodic` is listener-useful or should be removed. |
| The Red Panda Adventures | `formats: full-cast, episodic` | Recurring characters and a long case-based run could be serialized-with-arcs rather than purely episodic. | Official episode guide and multiple consecutive story arcs. | Classify case-based, serialized-with-arc, or episodic without forcing anthology. |
| TANIS | `formats: full-cast, serialized`; `voiceStyle: primarily-narrated` | The show uses a narrated/documentary frame and multiple voices; `primarily-narrated` may understate acted material. | Representative episodes/transcripts and production-format documentation. | Verify `primarily-narrated` versus `mixed` and retain only structure labels that help listeners. |
| WOE.BEGONE | `formats: serialized, episodic`; `voiceStyle: primarily-narrated` | Multi-season game/technology arcs and chapter-like episodes support a hybrid, but the exact boundary is editorial. | Representative audio/transcripts and season/arc map. | Confirm hybrid structure and whether the dominant voice style remains primarily narrated. |
| The Land Whale Murders | `formats: serialized` | Season/episode material may be more anthology-like or case-based than the single serial label implies. | Official season descriptions and consecutive episode summaries. | Verify serialized, season anthology, procedural, or hybrid structure. |
| Derelict | `formats: full-cast, serialized` | Season-based storytelling can be a single serial, linked season anthology, or hybrid; the current label does not express that distinction. | Official season map and representative episode descriptions/transcripts. | Confirm whether serialized is sufficient and whether a hybrid taxonomy is needed. |
| The Amelia Project | `formats: full-cast, anthology, serialized, episodic` | The official premise supports client stories plus an expanding arc, but the four-label bundle may be too broad for discovery. | Human review of several client episodes and arc episodes. | Choose the minimum useful hybrid labels and verify the existing balanced profile. |
| the Dead Letter Office of Somewhere, Ohio | `formats: serialized, anthology` | The official description says the anthology evolves into something else, but the transition point and present-day structure are not mapped. | Complete season/episode map and representative audio/transcripts. | Confirm the hybrid and decide whether a separate season-anthology taxonomy is needed. |
| The Thrilling Adventure Hour | `formats: episodic, full-cast, anthology` | Recurring ensembles and story segments may create serial arcs inside an anthology/radio-theater frame. | Official segment/season structure and representative episodes. | Confirm whether `episodic` and `anthology` both help or whether the format should be more precise. |

## Commitment and listening-route values

| Show | Suspicious field(s) and current value | Why it may be wrong | Missing evidence | Human verification action |
| --- | --- | --- | --- | --- |
| Case 63 | `commitment: short`; `bestFor: short-under-five-hours` | The catalog has two seasons and 22 entries but no verified total runtime. | Official complete episode list and durations. | Calculate the current total and keep/remove both short-route values together. |
| The Angel of Vine | `commitment: medium`; `bestFor: short-under-five-hours` | The observed lower bound is about 4.2 hours while lifecycle is unclear; the bucket crosses the short/medium boundary. | Complete current feed or authoritative total runtime. | Resolve the bucket and whether the short-listening route is defensible. |
| Blood Ties | `commitment: medium` | Only about 1.2 observed hours are available in the current evidence, with unclear scope. | Complete episode inventory and runtime coverage. | Remove or set the bucket only after the actual listenable scope is known. |
| Don't Mind | `commitment: long` | The observed lower bound is about 13.4 hours, below the long threshold, and the run may continue. | Verified current total and lifecycle/season scope. | Recalculate the bucket from a clearly scoped total or leave unresolved. |
| DUST | `commitment: long` | The anthology feed has about 13.8 observed hours and an open-ended/seasonal scope. | Complete current anthology inventory and duration coverage. | Verify whether the route is medium, long, or intentionally left unknown. |
| Tales From Wolf Mountain | `commitment: deep-dive` | The observed active total is about 24 hours, below the deep-dive threshold, and future scope is unknown. | Verified current total and release boundary. | Remove or correct the bucket unless a documented total exceeds 30 hours. |
| Artifacts of the Arcane | `commitment: deep-dive` | About 19.2 hours are observed on an active feed; the final scope is not known. | Current total/runtime coverage and lifecycle evidence. | Verify a >30-hour total or remove the deep-dive value. |
| Give Me Away | `commitment: deep-dive` | About 23.4 hours are observed on an active feed, below the threshold. | Current total and future-season boundary. | Verify or leave commitment unresolved. |
| Our Fair City | `commitment: deep-dive` | About 22.3 hours are observed while the feed is active; observed total is not final total. | Complete current catalog scope and runtime coverage. | Verify the bucket or remove it until the scope is defensible. |
| The Magnus Protocol | `commitment: deep-dive` | About 22.3 hours are observed on an active run, so the value may be premature. | Current season total and lifecycle evidence. | Verify >30 hours or use an evidence-backed lower bucket. |
| Wake Of Corrosion | `commitment: deep-dive` | About 23.9 hours are observed and lifecycle is unclear. | Authoritative current episode inventory and status. | Verify the total or remove the bucket. |

Automated validation must not close these entries. A human may confirm the
current value, replace it with a more precise hybrid/route, or remove it.

## Resolution ledger — 2026-09-17

The researched human decisions have now been applied to the authored catalog.
The original queue above is retained as the audit history; this ledger records
the final disposition of every entry. No repository-local primary evidence was
found that contradicted the supplied researched resolution for any record.

| # | Show | Resolution | Before → final value |
| ---: | --- | --- | --- |
| 1 | The Awkward Screw | CORRECTED | `formats: episodic` → `formats: serialized` |
| 2 | Attention HellMart Shoppers! | CORRECTED | `formats: episodic` → `formats: episodic, serialized` |
| 3 | Afflicted | CORRECTED | `formats: serialized, full-cast, episodic` → `formats: serialized, full-cast, anthology` |
| 4 | Camlann | CORRECTED | `formats: full-cast, serialized, episodic` → `formats: full-cast, serialized` |
| 5 | Darkest Night | CORRECTED | `formats: episodic, anthology` → `formats: anthology, serialized` |
| 6 | Doctor Who: Redacted | CORRECTED | `formats: serialized, full-cast, episodic` → `formats: serialized, full-cast` |
| 7 | Fairies and Dragons, Ponies and Knights | CORRECTED | `formats: serialized, episodic` → `formats: serialized` |
| 8 | Hi Nay | CORRECTED | `formats: serialized, episodic`; `discovery.voiceStyle` absent → `formats: serialized, episodic`; `discovery.voiceStyle: mixed` |
| 9 | King Falls AM | CONFIRMED | `formats: full-cast, serialized, episodic` → unchanged |
| 10 | The Black Tapes | CORRECTED | `formats: narrated, episodic, serialized` → `formats: narrated, serialized` |
| 11 | The Cellar Letters | CORRECTED | `formats: episodic` → `formats: serialized` |
| 12 | The Earth Collective | CORRECTED | `formats: serialized, narrated, episodic` → `formats: serialized, narrated` |
| 13 | The Grey Rooms | CORRECTED | `formats: full-cast, anthology, serialized, episodic` → `formats: full-cast, anthology, serialized` |
| 14 | The Liminal Lands | CORRECTED | `formats: serialized, episodic` → `formats: serialized` |
| 15 | The McIlwraith Statements | CONFIRMED | `formats: episodic, narrated, serialized` → unchanged |
| 16 | The Radio Adventures of Dr. Floyd | CORRECTED | `formats: episodic, serialized` → `formats: episodic` |
| 17 | The Rapscallion Agency | CORRECTED | `formats: serialized, episodic` → `formats: serialized` |
| 18 | The Red Panda Adventures | CONFIRMED | `formats: full-cast, episodic` → unchanged |
| 19 | TANIS | CONFIRMED | `formats: full-cast, serialized`; `discovery.voiceStyle: primarily-narrated` → unchanged |
| 20 | WOE.BEGONE | CORRECTED | `formats: serialized, episodic`; `discovery.voiceStyle: primarily-narrated` → `formats: serialized`; `discovery.voiceStyle: primarily-narrated` |
| 21 | The Land Whale Murders | CONFIRMED | `formats: serialized` → unchanged |
| 22 | Derelict | CONFIRMED | `formats: full-cast, serialized` → unchanged |
| 23 | The Amelia Project | CORRECTED | `formats: full-cast, anthology, serialized, episodic` → `formats: full-cast, episodic, serialized` |
| 24 | the Dead Letter Office of Somewhere, Ohio | CONFIRMED | `formats: serialized, anthology` → unchanged |
| 25 | The Thrilling Adventure Hour | CONFIRMED | `formats: episodic, full-cast, anthology` → unchanged |
| 26 | Case 63 | CONFIRMED | `commitment: short`; `bestFor: short-under-five-hours` → unchanged |
| 27 | The Angel of Vine | CORRECTED | `commitment: medium`; `bestFor: short-under-five-hours` → `commitment: short`; `bestFor: short-under-five-hours` |
| 28 | Blood Ties | CONFIRMED | `commitment: medium` → unchanged |
| 29 | Don't Mind | CORRECTED | `commitment: long` → `commitment: medium` |
| 30 | DUST | CORRECTED | `commitment: long` → `commitment: medium` |
| 31 | Tales From Wolf Mountain | CORRECTED | `commitment: deep-dive` → `commitment: long` |
| 32 | Artifacts of the Arcane | CORRECTED | `commitment: deep-dive` → `commitment: long` |
| 33 | Give Me Away | CORRECTED | `commitment: deep-dive` → `commitment: long` |
| 34 | Our Fair City | CONFIRMED | `commitment: deep-dive` → unchanged |
| 35 | The Magnus Protocol | CORRECTED | `commitment: deep-dive` → `commitment: long` |
| 36 | Wake Of Corrosion | CONFIRMED | `commitment: deep-dive` → unchanged |

Unresolved entries from this 36-record audit: **0**.
