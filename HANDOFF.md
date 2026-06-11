## Current task

Rebalance the show page so official copy, community interaction, and archive opinion are easier to scan, while reducing the noisy facts rail and removing the lower-page right-column dead space.

## Files changed

- `script.js`
- `detail.css`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Removed the hero-level full description, dropped the `Tone` band, moved `Key tags` into a quieter inline hero row, and replaced the old discovery boxes with an icon-led `Best for` strip.
- Added a dedicated `Official summary` section sourced from the existing `description` field so that listener-facing setup stays visually separate from the editorial `Archive take`.
- Promoted community interaction into a top-right `Community voice` card with stronger metric emphasis, a clearer rating CTA, and a deep link into the listener-review submit flow.
- Trimmed `Facts & links` down to creator/network, official links, status, seasons/episodes, and release dates only.
- Moved `Discovery routes` and the correction CTA out of the right rail and turned the lower `Start next`, `Discovery routes`, and correction blocks into full-width sections so the page no longer leaves a long empty right gutter under the facts rail.
- Added submit-page query-param support for `submissionType` and `showId`, allowing preselected listener-review and correction links from the show page.
- Updated smoke coverage for the new desktop/mobile ordering, reduced facts list, community CTA deep link, and the moved lower-page sections.
- Verified the updated desktop render with a fresh Playwright screenshot after the final layout pass.

## What still needs work

- `Creator / network`, `First release`, and `Latest release` still render truthful empty states until the catalog actually carries that data.
- The Browser plugin was not exposed as a callable local page-navigation tool in this session, so final visual QA used the repo’s Playwright dependency instead.

## Commands run

- `rtk npm test`
- `rtk npm run validate:data`
- `rtk npm run test:smoke`
- `rtk npm start`
- `rtk node - <<'NODE' ...` for final Playwright page screenshots of `show.html?id=impact-winter`

## Known issues

- No functional issues observed in this pass. Remaining gaps are data availability gaps, not renderer bugs.

## Current task

Redesign the podcast detail pages into a wider two-column archive layout with a persistent facts rail, a compact collapsed community module, stronger metadata surfacing, and truthful empty states for missing catalog fields.

## Files changed

- `script.js`
- `detail.css`
- `style.css`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Rebuilt the show-page renderer around a wide hero, a discovery band, a left main column, and a right utility rail instead of the old narrow stacked layout.
- Added hero stat cards for archive rating, community summary, runtime, format, completion, and release state, plus compact `Best for`, `Tone`, and `Key tags` bands.
- Replaced the old full-width snapshot/listen/community sections with rail cards for `Archive take`, `Facts & links`, `Discovery routes`, `Suggest a correction`, and a smaller collapsed `Listener rating` widget.
- Surfaced data-backed facts already present in the catalog, including seasons/episodes, average episode length, narration, structure, ads, favorite run, and re-listen signal, while showing clear `Not cataloged yet` placeholders for creator/network and release-date fields that do not exist yet.
- Updated the community widget so it stays collapsed by default, updates the new hero community stat card, and no longer leaks hidden controls into the rendered page.
- Tightened related-show cards into a denser strip and updated indexed-only pages like `solar` to use the same rail/empty-state treatment.
- Added smoke coverage for the new wide detail-page layout, collapsed community state, interaction flow, and sparse metadata handling on `impact-winter` and `solar`.
- Verified fresh desktop/mobile renders with local Playwright screenshots after the implementation and the hidden-state fix.

## What still needs work

- `Creator / network`, `First release`, and `Latest release` remain empty-state placeholders until the catalog/schema actually carries that data.
- The Browser plugin was not exposed as a callable local-page tool in this session, so visual QA used the repo's Playwright dependency instead.

## Commands run

- `rtk npm test`
- `rtk npm run validate:data`
- `rtk npm run test:smoke`
- `rtk node - <<'NODE' ...` for local Playwright desktop/mobile screenshot captures of `impact-winter` and `solar`

## Known issues

- No functional issues observed in this pass. Remaining gaps are data availability gaps rather than renderer bugs.

## Current task

Implement a maintainer-first review workflow so long-form editorial reviews can live in companion files and be scaffolded/published/reported with small commands instead of hand-editing one large catalog file.

## Files changed

- `data/shows.json`
- `data/reviews/impact-winter.json`
- `data/reviews/oz-9.json`
- `data/reviews/ars-paradoxica.json`
- `data/schema.md`
- `README.md`
- `podcast-ai/README.md`
- `podcast-ai/lib/reviews.js`
- `podcast-ai/lib/catalog.js`
- `podcast-ai/server.js`
- `podcast-ai/scripts/review-helpers.js`
- `podcast-ai/scripts/review-new.js`
- `podcast-ai/scripts/review-publish.js`
- `podcast-ai/scripts/review-report.js`
- `podcast-ai/package.json`
- `podcast-ai/test/catalog.test.js`
- `podcast-ai/test/review-workflow.test.js`
- `podcast-ai/test/browser.smoke.js`
- `script.js`
- `HANDOFF.md`

## What was completed

- Added optional `data/reviews/<show-id>.json` companion files and migrated the three existing full reviews into them.
- Extended the catalog loader to merge review companions into the loaded show records, preserve the existing string fields, expose paragraph arrays for rendering, and validate `full-review` entries against merged content.
- Served the merged catalog from `/data/shows.json` so the frontend keeps working without duplicating long review copy back into the raw metadata file.
- Updated show-page review rendering to support multiple paragraphs while keeping indexed and planned entries on the archive-note fallback path.
- Added maintainer scripts for scaffolding, publishing, and auditing reviews: `npm run review:new -- <show-id>`, `npm run review:publish -- <show-id>`, and `npm run review:report`.
- Added coverage for companion-review merge behavior, publish/scaffold/report workflow commands, and smoke coverage that now reads the merged loader-backed catalog instead of raw fixtures.
- Updated the repo docs to describe the companion review dataset and the maintainer workflow.

## What still needs work

- The local badge asset files under `images/badges/` and the existing `home.css` changes remain unrelated to this pass and were left untouched.
- If you want the static root to work under a generic file server again, it would need a build step that materializes the merged catalog instead of relying on the Node route.

## Commands run

- `rtk npm run validate:data`
- `rtk npm test`
- `rtk npm run check:links`
- `rtk npm run test:smoke`

## Known issues

- The frontend now depends on the Node service's merged `/data/shows.json` response for companion review content; a plain static file server will only expose the raw metadata index.

## Current task

Repair the expanded browse-card hover behavior so the active preview stays open while the cursor remains on the expanded panel, even when that panel overlaps another card.

## Files changed

- `script.js`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Reworked the hover controller so pointer transitions are ignored while the cursor is still inside the active expanded preview panel bounds, which stops covered cards from closing the open preview underneath the cursor.
- Kept the previous handoff behavior for actually exposed cards, so moving to another visible card still closes the old preview and opens the new one after the normal delay.
- Added a smoke-test regression that dynamically finds a real panel/card overlap in the current desktop layout and verifies that moving into that overlap zone does not close the active preview.
- Reran the full `podcast-ai` verification suite successfully after the fix.

## What still needs work

- No follow-up is required for this hover fix unless you want additional timing or animation tuning.

## Commands run

- `rtk npm run test:smoke`
- `rtk npm run verify`

## Known issues

- None observed in this pass.

## Current task

Tighten the expanded browse-card preview so the content fills the panel better, close the active preview as soon as another card is hovered, and extend the title accent rule.

## Files changed

- `script.js`
- `home.css`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Added a lower `archiveTake` note inside the expanded preview and redistributed the content column so the large empty band above the ratings/footer is replaced with useful archive copy instead of dead space.
- Lengthened and softened the title accent rule so it fades out more naturally into the card background.
- Changed desktop hover handoff so the currently open preview collapses immediately when a different card becomes hovered, instead of lingering until the next preview finishes opening.
- Extended the smoke test to cover that hover-to-another-card dismissal path, then reran the full `podcast-ai` verification suite successfully.
- Captured fresh desktop and mobile preview screenshots after the fix; the in-app browser could verify page identity and console health, but its exposed pointer-move API did not trigger this component's hover state, so screenshot proof used local Playwright fallback.

## What still needs work

- No follow-up is required for this pass unless you want another visual iteration on the preview copy hierarchy.

## Commands run

- `rtk npm run test:smoke`
- `rtk npm run verify`
- Browser QA on `http://127.0.0.1:3010/`
- `rtk node /tmp/echo-preview-check.js`
- `rtk node -e '...'` for a final desktop hover screenshot refresh

## Known issues

- The in-app browser's movement API did not put these cards into `:hover`, so visual hover screenshots were captured with the repo's local Playwright dependency instead.

## Current task

Compact the expanded browse-card preview, remove viewport-safe flipping/clamping, and keep the expanded panel anchored directly to the source card.

## Files changed

- `script.js`
- `home.css`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Reworked the expanded-card positioning logic so previews stay centered on the source card, keep the same hover/focus/touch behavior, and can overflow the viewport instead of flipping above or clamping inside the screen.
- Removed the `ARCHIVE ENTRY` kicker, changed the close control to a compact ghost `x`, tightened spacing/typography/media proportions, and converted the heavy `Open archive` pill into a lighter inline archive link.
- Updated the smoke suite to validate compact anchored geometry, reduced neighbor overlap, missing kicker text, inline link treatment, and allowed viewport overflow.
- Ran the `podcast-ai` automated test suite after the UI change.

## What still needs work

- No functional follow-up is required for the expanded-card compaction pass unless further visual tuning is wanted after manual review.

## Commands run

- `rtk npm test`
- `rtk npm run test:smoke`
- `rtk git diff -- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/script.js /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/home.css /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/podcast-ai/test/browser.smoke.js`

## Known issues

- The repo still has unrelated untracked badge image files in `images/badges/`; they were left untouched in this pass.

## Current task

Keep the compact browse-card `Full review` ribbon clipped to the card bounds without changing its placement.

## Files changed

- `home.css`
- `HANDOFF.md`

## What was completed

- Restored the existing compact-card `Full review` ribbon anchor values so the tag placement stays unchanged.
- Clipped the editorial badge layer to the card radius so the ribbon corners and tail no longer render outside the card.

## What still needs work

- A live browser check would confirm the clipped ribbon reads cleanly at the current local page state.

## Commands run

- `rtk git diff -- home.css`
- `rtk nl -ba home.css | rtk sed -n '1020,1098p'`
- `rtk nl -ba home.css | rtk sed -n '2788,2798p'`

## Known issues

- Root-site validation commands were not run because this repo root does not expose a matching `package.json` command for this static CSS adjustment.

## Current task

Place the compact browse-card `Full review` ribbon to match the `Card concept top tags` reference without changing the ribbon design itself.

## Files changed

- `home.css`
- `HANDOFF.md`

## What was completed

- Retuned the compact-card `Full review` ribbon anchor values so the badge sits farther into the top-right corner and clears more of the cover art face area, matching the concept more closely.
- Kept the existing ribbon styling intact and changed placement only.
- Verified the rendered `Impact Winter` card on the live local site at desktop and mobile viewports, using the in-app browser for DOM/console checks and local Playwright screenshots for visual proof after the browser screenshot API timed out.

## What still needs work

- No follow-up is required for the ribbon placement itself unless even tighter concept matching is wanted.

## Commands run

- `rtk npm start`
- Browser QA on `http://127.0.0.1:3010/index.html`
- `rtk npm test`
- `rtk npm run test:smoke`
- `rtk node - <<'NODE' ...` for temporary local Playwright screenshot captures

## Known issues

- The in-app browser screenshot capture timed out on this page, so visual verification used local Playwright screenshots instead.
- `rtk npm run test:smoke` still fails the existing `homepage expanding archive card supports stable hover, keyboard, touch, and edge-safe geometry` test in `podcast-ai/test/browser.smoke.js`; this pass only changed the compact card ribbon placement values.

## Current task

Reposition the compact browse-card `Full review` ribbon so it sits on the card like the `Card concept top tags` reference, without changing the ribbon styling itself.

## Files changed

- `home.css`
- `HANDOFF.md`

## What was completed

- Retuned the compact-card `Full review` ribbon anchor values in `home.css` so the badge sits on the artwork's top-right corner instead of floating above the card.
- Kept the existing ribbon design intact and changed placement only.
- Verified the rendered `Impact Winter` card against the live local site at `1280x720` and `390x844`.
- Ran the existing Node test suite from `podcast-ai`.

## What still needs work

- No follow-up is required for this placement fix unless stricter concept-matching is wanted.

## Commands run

- `rtk sed -n '...' script.js`
- `rtk sed -n '...' home.css`
- `rtk npm start`
- `rtk npm test`
- Browser QA on `http://127.0.0.1:3010/index.html`

## Known issues

- None observed in this pass.

## Current task

Rebuild the compact browse-card `Full review` ribbon in CSS so it matches the concept more closely and no longer depends on the broken extracted image artwork.

## Files changed

- `script.js`
- `home.css`
- `HANDOFF.md`

## What was completed

- Replaced the `Full review` badge image node with a text label so the ribbon can be drawn entirely in CSS.
- Rebuilt the badge as a rotated charcoal strap with layered gradients, restrained rear flap, condensed uppercase label styling, and retuned placement variables for the compact browse card.
- Verified the `Impact Winter` browse card render against the live local site at the default desktop viewport and at `390x844`.
- Ran the existing Node test suite in `podcast-ai` after the JS/CSS change.

## What still needs work

- No functional follow-up is required for this ribbon pass unless tighter concept-matching is wanted.

## Commands run

- `rtk sed -n '...' script.js`
- `rtk sed -n '...' home.css`
- `rtk npm start`
- `rtk npm test`
- Browser QA on `http://127.0.0.1:3010/index.html`

## Known issues

- The `Top rated` bookmark remains image-backed; this pass changed only the `Full review` ribbon.

## Current task

Match the compact browse-card `Full review` ribbon to the supplied concept image and verify the rendered result on the live local site.

## Files changed

- `home.css`
- `images/badges/full-review-ribbon.png`
- `HANDOFF.md`

## What was completed

- Rebuilt the black `Full review` ribbon artwork to better match the concept: cleaner charcoal finish, thinner bevel, shorter rear flap, balanced `FULL REVIEW` lettering, and a smaller red accent.
- Retuned the compact-card ribbon placement variables so the badge lands closer to the concept on the `Impact Winter` browse card instead of reading like a detached generic ribbon.
- Verified the rendered card on the live same-origin local server at desktop and mobile viewports after each asset/CSS iteration.

## What still needs work

- No functional follow-up is required for this ribbon pass.

## Commands run

- `rtk npm start`
- `rtk python3 ...` to regenerate `images/badges/full-review-ribbon.png`
- Browser QA on `http://127.0.0.1:3010/index.html`

## Known issues

- The fidelity pass was tuned against the live `Impact Winter` browse card, which is the same reference surface used in the supplied concept.

Replace the compact browse-card `Top rated` and `Full review` badge approximations with fixed artwork positioned to match the concept on the existing compact card.

## Files changed

- `script.js`
- `home.css`
- `images/badges/top-rated-bookmark.png`
- `images/badges/full-review-ribbon.png`
- `HANDOFF.md`

## What was completed

- Replaced the old badge DOM with minimal image-backed shells so the compact card no longer depends on live CSS text layout for badge fidelity.
- Added fixed badge artwork for the red `Top rated` bookmark and the black `Full review` strap, then positioned them against the existing compact card proportions.
- Regenerated the `Full review` strap artwork so it contains only the strap and rear flap, removing the accidental concept-background bleed from the earlier asset pass.
- Verified the `Impact Winter`, `Oz 9`, and `Ars Paradoxica` cards in the in-app browser at the default desktop viewport and at `390x844`.

## What still needs work

- No additional work is required for the compact browse-card badge fix itself.

## Commands run

- `rtk rg -n "Full review|FULL REVIEW|full review|review ribbon|top rated|creator verified|archive pick" index.html home.css script.js`
- `rtk sed -n '...' script.js`
- `rtk sed -n '...' home.css`
- `rtk python3 ...` to generate the badge artwork assets in `images/badges/`
- `rtk python3 -m http.server 4173`
- Browser QA on `http://127.0.0.1:4173/index.html`

## Known issues

- The static preview server does not provide the `/api/...` endpoints, so browser QA here covered the rendered card UI rather than the full same-origin API path.

## Current task

Redesign the compact browse-card `Full review` tag to match the concept more closely without letting it bleed outside the card or clip the label text.

## Files changed

- `script.js`
- `home.css`
- `HANDOFF.md`

## What was completed

- Rebuilt the `Full review` badge as a dedicated ribbon overlay with a separate label element instead of a single rotated pill.
- Clipped the ribbon within the card and retuned the angle/position so the full `FULL REVIEW` label stays visible on the compact card.
- Verified the `Impact Winter` browse card render in the in-app browser against the live local server after each CSS iteration.

## What still needs work

- If stricter fidelity to the concept is wanted, the remaining work is visual tuning only: ribbon thickness, angle, and the small red accent can be adjusted further.

## Commands run

- `rtk sed -n '...' script.js`
- `rtk sed -n '...' home.css`
- `rtk sed -n '...' podcast-ai/server.js`
- `rtk npm start`

## Known issues

- This pass focused on the compact browse card ribbon only; no broader regression sweep was run for other badge combinations beyond the rendered `Impact Winter` card checks.

## Current task

Remove the "Archive rating" and "Community rating" text labels from compact browse cards while keeping them visible on expanded cards/detail surfaces.

## Files changed

- `script.js`
- `HANDOFF.md`

## What was completed

- Updated the shared inline rating helpers so compact browse cards render only the icon + score value.
- Kept the rating labels on expanded preview cards by leaving their helper calls on the default labeled path.
- Ran the existing backend/frontend-adjacent Node test suite from `podcast-ai`.

## What still needs work

- A visual browser check on the browse page would confirm spacing still looks right across desktop and mobile after the labels were removed.

## Commands run

- `rtk rg -n "Archive rating|Community rating|community rating" .`
- `rtk sed -n '...' script.js`
- `rtk sed -n '1,220p' podcast-ai/package.json`
- `rtk npm test`

## Known issues

- No browser-based visual QA was run in this pass, so the change is verified by code path and automated tests rather than rendered inspection.
## Current task

Move the compact card `Top rated` corner flag slightly outside the card without changing its visual design.

## Files changed

- `home.css`

## What was completed

- Shifted the `Top rated` corner badge slightly up and left so it sits just outside the card edge.
- Allowed the badge to render outside the card while preserving the rounded top image corners.

## What still needs work

- A quick browser check would confirm the offset feels right across desktop and mobile card sizes.

## Commands run

- `rtk rg -n "Top Rated|top rated|topRated|Archive Pick|Creator Verified" .`
- `rtk sed -n '...' script.js`
- `rtk sed -n '...' home.css`
- `rtk git diff -- home.css`

## Known issues

- No rendered browser QA was run in this pass, so the position tweak is verified from CSS structure rather than visual inspection.
