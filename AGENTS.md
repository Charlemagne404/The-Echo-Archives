# AGENTS.md

## Project

The Echo Archives is a curated discovery platform for audio dramas and fiction podcasts. It helps users answer: “What should I listen to next?”

The site is listener-first, creator-supported, and editorially guided. It should feel like a dark cinematic archive, not a generic podcast directory.

For deeper product direction, refer to the project vision/product docs. Keep this file focused on how Codex should work in the repo.

## Current identity

Preserve the existing visual direction:

* Dark black/charcoal background
* Compact dense browsing layout
* Cinematic hero section
* Radio telescope / signal / archive atmosphere
* Cover-art-driven cards
* Red/orange archive accents
* Green community accents
* Thin borders and rounded cards
* Small, readable metadata
* Editorial archive language

Do not redesign the site into a generic SaaS dashboard, bright podcast app, Bootstrap layout, or overdone neon cyberpunk interface.

The current browse page layout and card density are intentional. Improve polish without changing the overall feel unless explicitly asked.

## Product priorities

Prioritize:

* Fast show discovery
* Clean show data
* Search and filtering
* Compact show cards
* Useful show detail pages
* Curated collections
* Ratings and reviews
* Mobile usability
* Metadata corrections and creator verification

Avoid feature creep. Prefer improving core discovery features over adding large new systems.

## Browse page rules

The browse page is the main discovery surface.

Keep it fast, dense, and useful. Users should reach actual shows quickly.

The hero should support discovery, not dominate the page. Avoid large vanity stats or oversized empty sections.

Show cards should stay compact by default. Cards may include:

* Cover art
* Title
* One or two key tags
* Archive rating
* Community rating
* Meaningful status labels only

Avoid:

* Long descriptions on default cards
* Metadata dumps
* Huge badges
* Repeating obvious labels
* Layout shifts
* Cards that become too tall or uneven without reason

Status labels like `Top Rated`, `Full Review`, `Creator Verified`, `New`, or `Archive Pick` should be compact and visually integrated.

## Ratings and meaning

Keep these concepts visually and logically separate:

* Archive rating = editorial perspective
* Community rating = listener response
* Creator verified = factual metadata checked by creator/official source

Creator verification must never imply creator approval of ratings or reviews.

Do not fake ratings, review counts, community scores, users, or verification states. Placeholder/dev data must be clearly marked.

## Collections

Collections are curated listening paths, not generic genre folders.

They should be based on mood, tone, intent, or useful recommendation routes.

Examples:

* Best for long walks
* Serious sci-fi
* Cold isolation horror
* Funny space disasters
* Completed shows
* Shows like Derelict
* Shows like Midnight Burger
* High-production audio dramas

Collection cards should feel like part of the archive’s discovery system, not filler content.

## Show detail pages

Show detail pages should contain deeper information that does not belong on compact cards.

Useful detail page content includes:

* Full description
* Archive take / review
* Archive rating
* Community rating
* Listen links
* Official links
* Tags
* Runtime
* Season / episode count
* Release status
* Format / narrator style
* Similar shows
* Collection appearances
* Creator verification status
* Metadata correction link

Separate objective metadata from editorial opinion and community content.

## Search and filtering

Search and filters should help users discover shows by more than title.

Support these when the data exists:

* Show title
* Creator
* Genre
* Tone
* Tags
* Format
* Status
* Runtime / commitment length
* Production style
* Similar shows
* Archive notes

Only add filters that are supported by real data.

Empty search/filter states should be helpful, not dead ends.

## Submissions and community

Community features should be moderated and quality-controlled.

Submissions may include:

* New shows
* Metadata corrections
* Listener reviews
* Creator verification requests
* Official links
* Tag suggestions
* Similar show suggestions

User-submitted content should not auto-publish unless explicit trusted moderation rules exist.

Guest contribution should be possible where practical. Continental ID should be an optional trust/identity layer, not a forced login wall.

## Continental branding

The Echo Archives belongs under the Continental ecosystem, but it should remain its own product.

Use Continental branding subtly, such as in the footer or production note. Do not make the site feel like a Continental advertisement.

## Data rules

Show data quality matters.

When editing data:

* Preserve the existing schema
* Keep formatting consistent
* Avoid unnecessary rewrites or reordering
* Do not delete entries unless asked
* Do not invent facts
* Use `unknown`, blank values, or TODO notes when unsure
* Keep objective metadata separate from ratings, reviews, and community content

If the user says certain shows should not be changed, do not touch them.

## AI / Archivist features

If working on “Ask the Archivist” or similar AI features, keep it archive-specific.

The AI should recommend from the archive’s own catalog, tags, ratings, reviews, and collections. It should not hallucinate shows or present unverified facts as certain.

The UI should be subtle and atmospheric, not a giant generic chatbot.

## Development behavior

Before making changes:

1. Inspect the relevant files.
2. Follow the existing structure and naming patterns.
3. Make the smallest clean change that solves the task.
4. Preserve existing behavior unless asked otherwise.
5. Check visual and mobile side effects.
6. Run available validation commands when possible.

Only run commands that exist in `package.json`.

Prefer:

* Simple readable code
* Existing patterns
* Existing CSS variables/classes
* Small targeted edits
* Responsive layouts
* Accessible HTML

Avoid:

* Rewriting the app for small tasks
* Adding dependencies without strong reason
* Breaking routes or data formats
* Creating huge components
* Leaving production-facing placeholder content
* Making hover-only features required on mobile
* “Improving” the design by changing the whole identity

## Visual polish checklist

When touching UI, check:

* Card spacing
* Text readability
* Border consistency
* Mobile layout
* Hover/focus states
* Empty states
* Loading states
* Button alignment
* Badge sizing
* Rating icon consistency
* Contrast

The site should feel polished, but still practical and content-first.

## Documentation

Use the consolidated docs for detailed product, roadmap, architecture, and operational notes:

* `docs/PRODUCT.md`
* `docs/ROADMAP.md`
* `docs/ARCHITECTURE.md`
* `docs/OPERATIONS.md`
* `data/schema.md`

If these files exist, update them when useful:

* `HANDOFF.md` for current task state
* `MEMORY.md` for long-term project facts
* `TODO.md` for discovered bugs or unfinished work
* `DECISIONS.md` for meaningful technical/product decisions
* `docs/archive/` for historical material that should be preserved but not kept active
* `docs/qa/` for dated QA reports
* `docs/research/feedback/` for research or design feedback snapshots

Do not dump every small change into documentation.

## Handoff rule

After meaningful work, update `HANDOFF.md` if it exists.

Include:

* Current task
* Files changed
* What was completed
* What still needs work
* Commands run
* Known issues

Keep it short and useful.

## Slow verification commands

`npm verify` is expensive. Do not run it automatically after every minor change.

Use focused checks during development. Save full verification for the end of the task, unless the change touches shared infrastructure, build tooling, routing, generated pages, or other areas where a small change can break the whole site.

Before pushing or final handoff, run `npm verify` once and fix any issues it reports.


## Final response style

When finishing a task, summarize:

* What changed
* Files touched
* Commands run
* Any issues or TODOs

Be direct and specific.
