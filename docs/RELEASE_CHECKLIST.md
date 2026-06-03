# Release Checklist

## Purpose

Use this checklist before publishing catalog, route, or operational changes to the live archive.

## Preflight

Run from `podcast-ai/`:

```bash
npm install
npm run verify
```

If `npm run verify` fails, do not publish.

## Route QA

Manually verify:

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
- Ask the Archivist opens and closes
- show and collection missing states stay coherent
- submit modes switch correctly across show, correction, listener review, and creator verification

## Catalog and asset checks

- no broken local covers or route assets
- no invalid absolute URLs in catalog links
- no invalid enum values or duplicate taxonomy terms
- no optional dataset errors if `creators.json`, `networks.json`, or `changelog.json` exist

## Launch checks

- `sitemap.xml` loads
- `robots.txt` loads
- submission and correction emails or queue-review habits are ready before promotion
- if content changed, update any inaccurate docs in `README.md`, `docs/ROADMAP_STATUS.md`, `docs/DATA_MODEL.md`, and `data/schema.md`
