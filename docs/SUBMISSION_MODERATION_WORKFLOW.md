# Submission And Moderation Workflow

## Current intake surface

Public intake stays on:

- `/submit.html`
- `POST /api/submissions/shows`

Supported `submissionType` values:

- `show`
- `correction`
- `listener-review`
- `creator-verification`

Everything enters the same SQLite-backed review queue. Nothing auto-publishes.

## Stored queue data

Each submission stores:

- shared identifying fields such as `show_title`, `existing_show_id`, `contact_email`, and optional link fields
- `payload_json` for type-specific structured data
- `provenance_json` for source-link data when relevant
- moderation metadata fields such as `status`, `review_notes`, `reviewed_by`, and `reviewed_at`

## Recommended manual statuses

The current system does not ship an admin UI. Use the `status` field manually with a small, predictable vocabulary:

- `new`
- `in-review`
- `accepted`
- `rejected`
- `needs-follow-up`

## Type-specific expectations

### `show`

- requires a contact email
- requires at least one of `officialSite` or `rssOrListenLink`
- `payload_json` stores the show-focused context sent through the form

### `correction`

- requires a known `existing_show_id`
- requires correction details in `notes`
- should only be used for factual archive fixes, not editorial disagreement

### `listener-review`

- requires a known `existing_show_id`
- requires a 1-10 rating
- requires review text
- stores rating, spoiler level, and review text in `payload_json`

### `creator-verification`

- requires a known `existing_show_id`
- requires at least one verification source link
- requires factual notes describing what should be verified or corrected
- stores source links in both `payload_json` and `provenance_json`

## Moderation rules

- keep archive editorial stance separate from community and creator input
- do not publish raw listener or creator submissions automatically
- treat creator verification as factual metadata review, not editorial review control
- preserve provenance links for factual changes when creator-verification data is used
