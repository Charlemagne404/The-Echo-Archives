# Echo 2.0 Browse and Library verification cleanup — 2026-10-04

## 320px Browse decision

Keep the two-column show grid at 320px. The mobile browser smoke measures roughly
138px cards with square cover art, a 24px column gap, ellipsized single-line
titles, contained ratings, and a 44px square Save control. The sort select,
search field, and filter control retain 44px touch height. The 320px touch
viewport has no horizontal page overflow. This is a compact but readable layout;
changing it to one column would reduce useful results without fixing a product
problem. The updated assertion checks these behaviors instead of the old
one-column assumption.

## History restoration

The history race was between `popstate` restoration and an asynchronous sort
request, especially the listener-rating sort. A sort request could finish after
Back and apply its stale state/results. Pending debounced search commits and
search renders could also outlive the history transition. The page now cancels
pending sort changes, search-history commits, and search renders before it
hydrates controls and results from the current URL. The sort controller uses a
request token so a late response cannot commit after cancellation. Search,
filter, sort, collection, empty-result, Back, Forward, and the delayed-sort race
are covered by deterministic state snapshots.

Popular remains the implicit Browse default; search defaults to relevance;
authored collection order is preserved unless a sort is explicit. No popularity
scoring or tuning parameters changed in this pass.

## Smoke contract cleanup

- Maintainer elevation checks now identify the exact accessible “Fast Show”
  heading and scope saved-review status to its semantic status element.
- Community-rating checks locate a show through its Library show-card marker
  and show ID, independent of the card's presentation class.
- The 320px smoke checks measured layout and touch behavior. Adjacent browser
  waits now use application-ready, transition-settled, and visible-clone states
  instead of fixed sleeps where the transition has a stable observable state.
- The collection-carousel hover smoke keeps a direct pointer move to avoid
  changing the rail's scroll position, and waits for the rail's hover/focus
  state before measuring its center-weighted card.
- The full verifier initially stopped at stale social-card test expectations
  for variant-specific wordmarks. Those test expectations now reflect each
  existing rendered variant; no social-card renderer behavior changed.
- The phone-width header smoke now waits for focus to reach the drawer's first
  focusable control after the menu opens, matching the component's animation-
  frame focus handoff.

At 844px, Browse's sort control also exposed horizontal overflow because its
minimum width exceeded the responsive toolbar track. The responsive rule now
lets the select fill its track without overflowing.

## Verification

Focused checks passed: browser 20/20, discovery/history 15/15, maintainer import
3/3, community rating 5/5, Browse 14/14, card interactions 4/4, accessibility
13/13, mobile launch 8/8, Library product 4/4, browse-state 7/7, Popular
regression 10/10, responsive robustness 1/1, and discovery analytics 10/10.
The required browser batch passed all configured files, including the history,
maintainer, community, analytics, and Library flows.

`build:pages` reused all 939 social cards. `check:generated` passed;
`check:structure` exited successfully with its existing soft-limit warnings;
`check:build-determinism` passed for 2,494 generated files; JS syntax checks and
`git diff --check` passed. The final `npm run verify` result is reported in the
task completion summary.
