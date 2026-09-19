# Similarity foundation

The reusable comparison layer lives in `shared/archive-similarity.js`. It is
deterministic, catalogue-grounded, and shared by the browser and
server-rendered show routes:

```js
const index = EchoArchiveSimilarity.createSimilarityIndex({ shows, collections });
const candidates = index.getSimilarShows("derelict", { limit: 8 });
```

Each candidate includes a score out of 100, pairwise metadata coverage, the
coverage available on each record, scored dimensions, and factual `reasons`.
The show-page UI renders those reasons directly without asking an AI service to
explain a recommendation. `metadataCoverage` is the weighted fraction of
currently supported factual dimensions available on both records; callers can
use `sourceMetadataCoverage`, `targetMetadataCoverage`,
`metadataCoverageByDimension`, and the available/missing dimension lists to
explain sparse results without treating missing optional data as a mismatch.

## Evidence used

- Existing `similarTo` / `similarReasons` links and anchored `similarity` collections are preserved as explicit editorial evidence.
- Typed `entityLinks` are used for creator, production-company, studio, and network overlap. Legacy `creatorId`, `networkId`, and raw creator strings are not treated as stable foreign keys.
- Canonical `genres`, `formats`, `tones`, `themes`, `tags`, `bestFor`, and the optional controlled `discovery` profile (`voiceStyle`, `narrativeFocus`, `intensity`, and `commitment`) are compared as normalized sets. Legacy `content.intensity` is used only as a fallback while the controlled field is absent.
- Typed creator/entity overlap is frequency-adjusted so a common network or production entity cannot dominate a result.
- `releaseStatus` and `completionStatus` are reduced to known controlled states only; unknown/unclear values do not create a match. `length.avgEpisodeMinutes` (falling back to the median), episode count (falling back to season count), and shared curated collections supply small factual anchors when both records support them.
- Shared `curated`, `editorial`, and `similarity` collection membership is returned as separate evidence. Rule-based and semantic collection membership is intentionally excluded so it is not double-counted as independent similarity evidence.

Common metadata values still count, but they contribute less than rarer values
using a catalog-frequency calculation. Missing metadata is not treated as a
negative match; `metadataCoverage` tells the caller how much comparable data
was actually available.

The public recommendation adapter keeps this scoring model intact while adding
discovery guardrails. It gives tone/theme/tag/listening-context combinations
more influence than broad genre/format overlap, adds a small cohesion lift when
multiple discovery dimensions agree, and requires multiple specific signals
plus factual anchors before a computed match is surfaced. The catalogue-wide
frequency calculation means a shared value such as a common tone or format
cannot carry a recommendation by itself.

`getEditorialSimilarityMatches()` is the display-facing view of explicit
catalogue relationships. It merges outgoing and incoming `similarTo` links and
anchored `similarity` collection members once, preserving written reasons and
deterministic catalogue order. `getPublicSimilarityMatches()` excludes those
editorial relationships, returns up to four computed matches, and uses a
deterministic greedy diversity pass so the visible set does not repeat the same
metadata profile. Exact RSS/Apple/Spotify identity matches receive a soft
near-duplicate penalty rather than being deleted: a genuine follow-on can still
appear when the evidence warrants it.

Computed explanations are grouped to at most two meaningful dimensions (for
example, a shared production company plus tone, or shared tone plus theme).
Sparse records can use a lower evidence floor only when they still have several
specific signals and enough catalogue coverage; those results are marked
`limited-metadata` by the public adapter. Records with only broad genre/format
facts remain without computed recommendations rather than receiving fabricated
certainty.

Shows Like collection pages use `getShowsLikeCollectionView()` as a stricter
public adapter around the same index. Authored collection members and their
written `showReasons` stay first; only when a route is short can high-confidence
computed matches fill the remaining slots. Computed picks are kept in a
separate `Less obvious picks` section with pair-specific, score-free reasons.
Sections such as closest overall, atmosphere, premise, characters, or
storytelling are only emitted when at least two authored recommendations have
the relevant evidence. Additional generated routes are created only for public
anchors with a rich discovery profile and at least four explained authored
`similarTo` targets, so the catalogue does not become a directory of thin SEO
pages.

Archive ratings are returned as an evidence-only `ratingProfile` dimension.
They are not part of the score: only a small reviewed subset has ratings, and a
shared quality assessment is not the same as shared story/content similarity.

Descriptions, archive reviews, `archiveTake`, free-form settings/structure,
popularity, unknown release state, and review status are not scored. This
avoids turning prose, lifecycle metadata, or sparse editorial coverage into
invented similarity claims. A normal candidate needs at least two matched
metadata dimensions and one factual anchor; sparse records use the separately
configured lower score floor only when they still meet that same two-dimension
anchor gate. Authored similarity links remain eligible even when the target
record is sparse.

## Local inspection

Run the read-only report with:

```sh
npm run report:similarity
npm run report:similarity -- --show=derelict --limit=8
```

The report prints current signal coverage and the reasons returned for a few
anchor shows. It also reports candidate-count coverage, score distribution,
common factual reasons, and how candidate counts/scores differ between sparse,
medium, and enriched records. It does not modify authored catalog files or
generated output.
