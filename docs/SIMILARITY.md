# Similarity foundation

The reusable comparison layer lives in `shared/archive-similarity.js`. It is
deterministic, catalog-grounded, and safe to use from a future browser view or
server-rendered route:

```js
const index = EchoArchiveSimilarity.createSimilarityIndex({ shows, collections });
const candidates = index.getSimilarShows("derelict", { limit: 8 });
```

Each candidate includes a score out of 100, pairwise metadata coverage, the
coverage available on each record, scored dimensions, and factual `reasons`. A
future UI can render the reasons directly without asking an AI service to
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
