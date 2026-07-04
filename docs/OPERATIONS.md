# Operations

## Purpose

This is the active operations and runbook reference for The Echo Archives.

Use it as the source of truth for:

- release preflight
- manual QA expectations
- submission and moderation handling
- documentation maintenance rules
- where dated QA and historical records live

## Release Preflight

Install backend dependencies when needed:

```bash
npm --prefix backend install
```

Run release preflight from the repo root:

```bash
npm run verify
```

If `npm run verify` fails, do not publish.

`npm run verify` currently:

- regenerates committed root HTML from `site-src/`
- runs repo structure checks
- runs backend data validation
- runs archive link checks
- runs backend tests
- runs Playwright smoke coverage

The working tree should stay clean after verification. If `npm run build:pages` or `npm run verify` changes generated root HTML, review the diff and commit it instead of hand-editing the public page files.

## Generated Output Rule

Keep these ownership rules intact:

- `catalog-src/` is authored catalog source
- `site-src/` is authored page source
- root HTML files are generated, committed public output
- `shared/` contains active runtime code, shared styles, and active config
- `data/` contains generated runtime/public catalog output only
- `docs/`, `docs/research/`, and `docs/archive/` are never runtime inputs
- temporary outputs belong in ignored temp locations, not tracked repo folders

## Catalog And Asset Checks

Validation and normal startup can auto-download missing show cover art into `images/covers/` and rewrite the authored show source with the resolved local cover path.

Review and commit those changes when they are legitimate.

Before publishing catalog changes, confirm:

- no broken local covers or route assets remain
- no invalid absolute URLs exist in listen or official links
- no invalid enum values or duplicate taxonomy terms exist
- no review companion merge issues exist
- no optional dataset errors exist if `creators.json`, `networks.json`, or `changelog.json` are introduced later

## Manual Route QA

Verify these public routes before publishing significant catalog, route, style, or behavioral changes:

- `/`
- `/about`
- `/for-creators`
- `/creator-standards`
- `/supporters`
- `/help-center`
- `/collections`
- `/collection?id=<known-collection-id>`
- `/show?id=<known-show-id>`
- `/submit`
- `/privacy`
- `/terms`
- `/cookies`
- `/copyright`

Checks:

- page title and canonical URL match the route
- homepage trust stats render
- homepage search, structured filters, quick filters, and recently updated mode work
- homepage most-popular band behaves sensibly with and without community summary data
- no-results recovery actions work
- inline preview and card interactions do not produce layout breakage
- Ask the Archivist opens and closes cleanly
- show and collection missing states stay coherent
- submit modes switch correctly across show, correction, listener review, and creator verification

If maintainer auth is enabled, also verify:

- `/maintainer/submissions.html`
- `/maintainer/submissions/report.html`
- `/maintainer/imports.html`
- `/maintainer/imports/report.html`

## Launch Checks

- `sitemap.xml` loads
- `robots.txt` loads
- legacy show-detail redirects still land on canonical `show.html?id=...` routes
- submission and correction handling is ready before promotion
- docs stay accurate when routes, schema, or operating assumptions change

## Submission Intake Surface

Public intake currently lives on:

- `/submit`
- `POST /api/submissions/shows`

Supported `submissionType` values:

- `show`
- `correction`
- `listener-review`
- `creator-verification`

Everything enters the same SQLite-backed review queue. Nothing auto-publishes.

Maintainer review has protected internal surfaces:

- `/maintainer/submissions.html`
- `/maintainer/submissions/report.html`

Protected queue APIs:

- `POST /api/maintainer/session`
- `DELETE /api/maintainer/session`
- `GET /api/maintainer/submissions`
- `GET /api/maintainer/submissions/:id`
- `PATCH /api/maintainer/submissions/:id`

Maintainer routes are disabled unless `MAINTAINER_REVIEW_PASSPHRASE` is configured.

Use:

- `MAINTAINER_REVIEW_COOKIE_SECRET` to sign the session cookie
- `MAINTAINER_REVIEW_SESSION_TTL_HOURS` to control session length

## Catalog Import Lane

Machine-found show intake is separate from the public submission queue.

Protected internal import surfaces:

- `/maintainer/imports.html`
- `/maintainer/imports/report.html`

Protected import APIs:

- `GET /api/maintainer/imports`
- `POST /api/maintainer/imports`
- `GET /api/maintainer/imports/search`
- `GET /api/maintainer/imports/:id`
- `POST /api/maintainer/imports/:id/hydrate`
- `PATCH /api/maintainer/imports/:id/review`
- `POST /api/maintainer/imports/:id/draft`
- `POST /api/maintainer/imports/:id/publish`

Useful import CLI commands:

```bash
cd backend
npm run import:seed -- --file ./tmp/import-list.txt
npm run import:hydrate -- --candidate <candidate-id>
npm run import:report
npm run import:draft -- --candidate <candidate-id>
npm run import:publish -- --candidate <candidate-id>
```

Import workflow:

1. Seed titles, Apple URLs, RSS URLs, or mixed newline lists into the internal queue.
2. Hydrate candidates from RSS first where possible, using Apple as the default discovery and `feedUrl` recovery path.
3. Review duplicate matches, scope status, and factual metadata before touching `catalog-src/shows/`.
4. Write approved candidates into `catalog-src/shows/` as `status: "draft"` and regenerate `data/`.
5. Fill archive-owned discovery and editorial fields manually.
6. Publish only after the record satisfies normal `published` validation and Gate B discovery rules.

Operational rules:

- nothing public auto-publishes
- objective metadata may be auto-hydrated
- AI suggestions remain suggestions only
- Podcast Index enrichment is optional and must degrade cleanly when credentials are absent
- external source calls should stay rate-limited and batch-oriented; prefer seeding first, then hydrating candidates in review waves instead of hammering providers one record at a time

Duplicate review rules:

- prefer feed URL matches over title-only matches
- treat Apple collection id, Podcast Index feed id, and Podcast Index guid matches as strong duplicate signals
- use normalized title plus creator matches as review prompts, not auto-merge rules
- mark duplicates in the queue instead of deleting history

## Queue Data Expectations

Each submission should store:

- shared identifying fields such as `show_title`, `existing_show_id`, `contact_email`, and optional link fields
- `payload_json` for type-specific structured data
- `provenance_json` for source-link data when relevant
- moderation metadata such as `status`, `priority`, `review_notes`, `reviewed_by`, and `reviewed_at`

## Recommended Moderation Statuses

Use a small predictable vocabulary:

- `new`
- `in-review`
- `accepted`
- `rejected`
- `needs-follow-up`

## Type-Specific Submission Rules

`show`:

- requires a contact email
- requires at least one of `officialSite` or `rssOrListenLink`
- stores show-focused context in `payload_json`

`correction`:

- requires a known `existing_show_id`
- accepts optional contact email
- requires factual correction details in `notes`
- should not be used for editorial disagreement

`listener-review`:

- requires a known `existing_show_id`
- accepts optional contact email
- requires a 1 to 10 rating
- requires review text
- stores rating, spoiler level, and review text in `payload_json`

`creator-verification`:

- requires a known `existing_show_id`
- accepts optional contact email
- requires at least one verification source link
- requires factual notes describing what should be verified or corrected
- stores source links in both `payload_json` and `provenance_json`

## Moderation Rules

- Keep archive editorial stance separate from community and creator input.
- Do not publish raw listener or creator submissions automatically.
- Treat creator verification as factual metadata review, not editorial control.
- Preserve provenance links for accepted factual changes sourced from creators or official channels.

## Community Rating Rules

- Keep community rating clearly separate from Archive Rating.
- Do not imply creator endorsement through creator verification.
- Community rating writes use a server-issued HTTP-only voter cookie for one active vote per show per device.
- Configure `COMMUNITY_TURNSTILE_SITE_KEY` and `COMMUNITY_TURNSTILE_SECRET_KEY` to require Cloudflare Turnstile on rating writes.
- Keep `COMMUNITY_VOTER_HASH_SECRET` stable between deploys so existing voter cookies keep resolving to the same hashed profile.
- Public averages stay hidden until `COMMUNITY_MIN_PUBLIC_RATINGS` verified votes exist for a show. The default threshold is `3`.
- Rating abuse signals use salted IP and user-agent hashes and should be pruned with `COMMUNITY_ABUSE_RETENTION_DAYS`, defaulting to `30`.

## Documentation Maintenance

Active repo-wide docs:

- `README.md`
- `AGENTS.md`
- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `data/schema.md`
- `backend/README.md`

Supporting records:

- `HANDOFF.md`: current task state and recent handoff notes
- `MEMORY.md`: stable long-term repo facts worth preserving across tasks
- `TODO.md`: small discovered follow-ups that are not full roadmap items
- `docs/qa/`: dated QA reports
- `docs/research/feedback/`: design and research feedback snapshots
- `docs/archive/`: retired planning and historical material

Documentation rules:

- keep active docs current and concise
- prefer updating an existing source-of-truth doc over creating a new planning file
- use exact counts and exact dates when recording current project state
- move retired one-off plans and historical snapshots into `docs/archive/`
- keep archival datasets under `docs/archive/data/` and concept art under `docs/research/concepts/` when they are no longer active inputs
- keep dated QA as reports, not as evergreen guidance

## Current QA Record

The latest recorded mobile QA pass still lives at:

- `docs/qa/2026-06-07-mobile-qa.md`

If a newer manual QA pass is done, add a new dated report instead of overwriting the old one.
