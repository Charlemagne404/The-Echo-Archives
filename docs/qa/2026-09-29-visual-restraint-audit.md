# Echo 2.0 visual-restraint audit

Date: 2026-09-29 to 2026-09-30

Scope: locally rendered desktop and mobile experience, using the existing Echo surfaces and synthetic browser-local Library data.

## Assessment

The integrated experience still reads as Echo: the dark, compact archive layout remains in place, and the 2.0 behavior is presented through existing cards, detail actions, search feedback, and Try Next. No new route, navigation item, dashboard, settings page, recommendation section, or onboarding surface was added in this audit.

The most material visual defect found was the open show-detail Library disclosure being clipped by its hero container, especially on mobile. A scoped stacking/overflow rule now lets the disclosure remain fully visible. Several new copy strings were also shortened or made conditional so that technical wording and privacy explanations do not add avoidable visual weight.

## Visible 2.0 addition inventory

| Addition | Where and when it appears | Listener value and restraint assessment |
| --- | --- | --- |
| Compact Library state control | On show cards, as a small action/current-state affordance over the cover | Saves a show or exposes its current state without adding a card row. The control stays secondary to the artwork and title; its overlay is absolutely positioned and does not increase card height. |
| Detail Library disclosure | In the existing show-detail action area; closed by default and opened on demand | Provides the fuller state, private rating, and Personal Discovery controls where they belong. It remains one disclosure instead of a separate Library page or persistent panel. |
| Private rating | Inside the open detail disclosure | Supports private organization and personalization while clearly distinguishing it from Community Rating. It is not repeated on browse cards. |
| Personal Discovery opt-in | Inside the same disclosure; off by default | Makes personalization explicit and browser-local without creating a mode banner or settings surface. Its short help text explains the source of personalization. |
| Hidden-state explanation | Only while the detail state is Hidden | Explains that Hidden affects personalized results while the direct show page remains available. The note is hidden for every other state. |
| Personal recommendation reason | In existing discovery feedback, only when the personal ranking changes a result | Gives a grounded explanation without adding copy to every candidate or increasing card height. The sampled reason fits on one line. |
| Rich-query interpretation and recovery feedback | In the existing result summary and empty-results area when a query needs it | Explains similarity counts, runtime uncertainty, unresolved intent, ambiguity, and strict no-result recovery using the established search surfaces. Simple title searches remain ordinary and do not get an interpretation panel. |

## Simplifications made

- Replaced internal-sounding “computed matches” wording with “more similar shows” and removed the “Runtime evidence” label. Unknown runtime is stated as “Runtime unknown”; known qualifiers use a shorter “Runtime: observed, reported, or estimated” form.
- Shortened the Library state prompt to “Choose a state,” the private-rating note to “Private to this browser; never submitted as a Community Rating,” and the Personal Discovery helper to “Uses your Library states and private ratings.”
- Hidden-state guidance now appears only for Hidden, and the explanation is reduced to the result behavior plus assurance that the show page stays available.
- Shortened personal reasons: tone and tags use compact inline values, and the anchor context uses “(rated 5/5),” “(saved),” or “(listening).” Reasons remain conditional on an actual result change.
- Fixed the detail disclosure clipping with a style rule scoped to the open Library disclosure.

## Retained additions

- Kept the compact card control because it offers an immediate, low-footprint save/state action at the point of discovery.
- Kept private rating and the opt-in inside the detail disclosure, where the richer controls are expected. The public/archive rating, Community Rating, and private rating remain separate concepts.
- Kept personal reasons only when the local preference materially changes a result; the text is evidence-based and uses the existing feedback area.
- Kept query feedback for rich or uncertain searches because it prevents misleading results. It stays in the existing summary and empty-state surfaces rather than introducing a panel.

## Desktop and mobile findings

Inspection covered the homepage before search, title and broad search, rich/similarity/runtime and empty-result states, Library enabled/disabled states, show detail with and without Library state, private rating and opt-in, Try Next with personalization off/on, collection, Shows Like, and creator surfaces. Captures are from local Chromium at desktop and 390 × 844 mobile dimensions.

- The homepage retained its measured document height: 7,134 px at 1,440 × 1,000 desktop and 14,688 px at 390 × 844 mobile, matching the captured pre-integration measurements. The homepage remained a 60-card browse surface in both measurements.
- Measured representative card geometry stayed compact: desktop show-card shell 671 px with 324 px artwork; mobile shell 305 px with 171 px artwork. The Library affordance overlays the card and does not add a row or change those dimensions.
- No horizontal overflow was found on the inspected home, collection, Shows Like, and creator layouts at 390 px. The corresponding desktop collection, Shows Like, and creator pages also fit without horizontal overflow.
- The open detail disclosure is now fully visible at 390 × 844; the Personal Discovery checkbox remains inside the viewport. Its open panel measured about 309 px high on mobile and 294 px on desktop.
- The sampled Try Next pages retained their existing layout. With the local test profile, the sampled White Vault and King Falls pages did not change result order, so no personal reason appeared there.

## Search, Personal Discovery, and Library assessment

Simple search remains visually ordinary. Rich similarity and runtime feedback is short and listener-facing, while ambiguity, unresolved language, and strict empty results continue to use existing result/empty-state areas. No scores or engine terminology are exposed in the user-facing copy reviewed here.

Personal Discovery stays an explicit local opt-in that defaults off. It subtly adjusts the existing results and only explains a changed result. The sample reason fits on one line; the control and reason do not create a mode-switch banner or new recommendation section.

Library actions remain small on cards and richer on show details. The detail control fits the existing action area, and its disclosure is fully visible at the audited mobile size. Private state and rating remain local and separate from public catalogue and community content.

## Accessibility and validation

The changed behavior is covered by the existing smoke and unit suites, including state visibility, keyboard Space and pointer operation, mobile checkbox visibility, accessible semantics, privacy boundaries, and changed copy.

- `rtk npm run build:pages` passed. `rtk npm run benchmark:discovery -- --strict` passed with 57 reviewed cases unchanged, 160 supported target checks, and zero failures. `rtk npm --prefix backend run test:library:product` passed 4/4; `rtk npm run test:personal-discovery` passed 11/11.
- The completed standalone `rtk npm --prefix backend run test:smoke:required` rerun passed, including the offline cached-home check. In the later full run, accessibility passed 13/13 and mobile launch passed 8/8.
- The captured full `rtk npm verify` run exited 1. Build, generated-boundary, release-artifact, tools (155 total; 0 failures and 5 platform skips), and backend serial tests (444 total; 0 failures) passed. Five cases in `backend/test/community-rating-flow.smoke.js` failed in the common setup hook because its disposable server did not answer `http://127.0.0.1:57756/api/health` before the startup timeout. Those cases did not reach their product assertions. Separate required-smoke and backend verification processes appeared in the shared checkout during and after this run; their overlap is observed, but its role in the timeout is not established. The startup group was not rerun in isolation because multiple shared browser-test runs remained active.
- Data validation reported existing soft-limit warnings for large cover files; release-artifact sanity returned `ok: true` with no release warnings. `rtk proxy git diff --check` passed.

Manual release check: exercise the open detail disclosure on Safari/iOS, especially stacking near the viewport edge. This audit used Chromium, so it does not establish cross-browser rendering behavior.

## Screenshots

Screenshots and before/after geometry captures are in [`output/playwright/`](/Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/output/playwright). The corrected open detail disclosure is shown in `2026-09-29-desktop-show-library-open.png` and `2026-09-29-mobile-show-library-open.png`; `2026-09-29-mobile-show-library-open-clipped.png` preserves the initial clipped state for comparison. Search and personalization examples include the `2026-09-29-desktop-search-*.png` and `2026-09-29-desktop-home-library-*.png` captures.
