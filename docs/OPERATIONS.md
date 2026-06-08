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

Run from `podcast-ai/`:

```bash
npm install
npm run verify
```

If `npm run verify` fails, do not publish.

## Manual Route QA

Verify these routes before publishing significant catalog, route, or operational changes:

- `/`
- `/collections.html`
- `/collection.html?id=<known-collection-id>`
- `/show.html?id=<known-show-id>`
- `/about.html`
- `/submit.html`

Checks:

- page title and canonical URL match the route
- homepage trust stats render
- homepage filters and recently-updated mode work
- no-results recovery actions work
- Ask the Archivist opens and closes cleanly
- show and collection missing states stay coherent
- submit modes switch correctly across show, correction, listener review, and creator verification

## Catalog And Asset Checks

- no broken local covers or route assets
- no invalid absolute URLs in catalog links
- no invalid enum values or duplicate taxonomy terms
- no optional dataset errors if `creators.json`, `networks.json`, or `changelog.json` exist

## Launch Checks

- `sitemap.xml` loads
- `robots.txt` loads
- submission and correction handling is ready before promotion
- docs stay accurate when routes, schema, or operating assumptions change

## Submission Intake Surface

Public intake currently lives on:

- `/submit.html`
- `POST /api/submissions/shows`

Supported `submissionType` values:

- `show`
- `correction`
- `listener-review`
- `creator-verification`

Everything enters the same SQLite-backed review queue. Nothing auto-publishes.

## Queue Data Expectations

Each submission should store:

- shared identifying fields such as `show_title`, `existing_show_id`, `contact_email`, and optional link fields
- `payload_json` for type-specific structured data
- `provenance_json` for source-link data when relevant
- moderation metadata such as `status`, `review_notes`, `reviewed_by`, and `reviewed_at`

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
- requires factual correction details in `notes`
- should not be used for editorial disagreement

`listener-review`:

- requires a known `existing_show_id`
- requires a 1-10 rating
- requires review text
- stores rating, spoiler level, and review text in `payload_json`

`creator-verification`:

- requires a known `existing_show_id`
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
- Keep anti-spam and visibility-threshold rules in place as public use grows.

## Documentation Maintenance

Active repo-wide docs:

- `README.md`
- `AGENTS.md`
- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `data/schema.md`
- `podcast-ai/README.md`

Supporting records:

- `HANDOFF.md`: current task state and recent handoff notes
- `MEMORY.md`: stable long-term repo facts worth preserving across tasks
- `TODO.md`: small discovered follow-ups that are not full roadmap items
- `docs/qa/`: dated QA reports
- `docs/research/feedback/`: design and research feedback snapshots
- `docs/archive/`: retired planning and historical documents

Documentation rules:

- keep active docs current and concise
- prefer updating an existing source-of-truth doc over creating a new planning file
- move retired one-off plans and historical snapshots into `docs/archive/`
- keep dated QA as reports, not as evergreen guidance

## Current QA Record

The latest recorded mobile QA pass lives at:

- `docs/qa/2026-06-07-mobile-qa.md`
