# Personal Discovery QA — 2026-09-29

## Scope and result

This report records local worktree evidence for Personal Discovery. The feature is device-local and explicitly opt-in. Its control is a small checkbox inside the existing show-detail Library disclosure, unchecked by default. There is no Library route, settings page, dashboard, or new homepage section. The worktree was not staged, committed, or published.

The feature is ready for the remaining product/release review. Staging, rollback, legal review, and deployment evidence are still open; this report is not a production sign-off.

## Behavior verified

- The page runtime receives only the sanitized Library context: `enabled` plus entry `showId`, `state`, and an explicitly entered `rating`. It reads no database handles, timestamps, title snapshots, or unrelated browser state.
- The separate deterministic helper runs only after public candidate retrieval and hard filters. It cannot add candidates, relax constraints, change authored recommendation order, or personalize collection/entity results. It moves eligible candidates by at most three places.
- Explicit private ratings weigh 5:+3, 4:+2, 3:0, 2:-2, and 1:-3. Saved and Listening are weak +1 anchors only when no explicit rating exists. Finished is not positive. Dropped is exact-show suppression in recommendation contexts, not a negative similarity signal. Hidden suppresses only its exact show while the preference is on.
- Exact-title lookup still finds a Hidden show, and direct show routes remain available. A grounded reason appears in the existing results summary only when an eligible visible candidate actually moves; it names the anchor signal and public similarity evidence without exposing a score.
- Disabled, unavailable, and cleared contexts preserve the same public result IDs, order, section membership, visibility, and analytics position buckets. Cross-tab updates and reload use the existing local Library service subscription.

The homepage’s Personal Discovery similarity metadata is joined in memory from the existing search index and the separate public runtime-evidence projection. `data/search-index.json` remains unchanged so the frozen v1 benchmark fingerprint stays stable. No personal profile, context, or personalized result is persisted in the public search cache.

## Privacy and UI checks

The required-browser product flow verifies that local states, ratings, opt-in, and personal reasons do not appear in captured requests; that the control is unchecked initially; and that disabling or clearing restores exact baseline order. URL/history and public result-position measurements contain no Library state. The personal reason uses a non-live result note and is absent when no personalized result moved.

The browser flow also checks the detail disclosure at a 390 px viewport, control bounds, keyboard use, cross-tab synchronization, reload persistence, and removal of the last entry. The home integration screenshot report documents unchanged desktop and mobile browse density: [Discovery homepage integration QA](2026-09-29-discovery-homepage-integration.md). A manual screen-reader spot check remains part of release review.

## Performance sample

Command: `rtk npm run benchmark:personal-discovery` on Node v24.14.1, query `sci-fi`, 3 warmups, 24 measured calls per mode. This is an in-memory comparison over 50 public candidates, not browser end-to-end latency.

| Library entries | First enabled call | Disabled median / p95 | Enabled median / p95 | Grounded reasons |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 17.565 ms | 6.232 / 6.975 ms | 6.176 / 9.161 ms | 0 |
| 5 | 30.854 ms | 5.739 / 6.341 ms | 5.819 / 7.208 ms | 3 |
| 20 | 56.896 ms | 5.339 / 6.322 ms | 5.645 / 6.624 ms | 6 |

Warm enabled p95 stayed below 10 ms in this sample. The first enabled comparison prepares the bounded public pairwise profile and reached 56.896 ms for 20 entries. There is no approved latency budget, browser end-to-end performance sample, or 10x catalogue stress result yet; the release performance gate remains open.

## Validation

- `rtk npm run test:personal-discovery` — 10 passed, 0 failed.
- `rtk npm --prefix backend run test:library:product` — 4 passed, 0 failed.
- `rtk npm verify` — passed end-to-end. Tools: 149 passed, 0 failed, 5 platform-dependent skips; backend serial tests: 444 passed, 0 failed, 0 skipped; required Chromium smoke: 96 passed, 0 failed, 0 skipped. Playwright-managed Chromium revision 1223 was available. The run also rebuilt catalogue/pages, passed structure/generated-boundary/release-artifact checks and deterministic build for 1,552 generated files (SHA-256 `754efd84325bcd512aad9764955db2657132c1e1784f279d222532ca9c9fd1ad`).
- `rtk git diff --check` — passed after generated output was rebuilt.

Catalogue validation reported zero integrity errors and source-backed entity-role warnings. Tool-test skips were for Linux/GNU production tooling or Restic unavailable on this macOS environment. Existing module-size and referenced-cover size notices remain non-blocking.

## Remaining release evidence

This worktree has no staging-origin isolation, rollback, legal-review, production deployment, manual screen-reader, or accepted performance-budget evidence. Those remain open in [2.0 release gates](../2.0/RELEASE-GATES.md).
