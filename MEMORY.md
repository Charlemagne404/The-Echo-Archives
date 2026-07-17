# Repo Memory

- The active repo-wide doc set is `README.md`, `AGENTS.md`, `docs/PRODUCT.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `data/schema.md`, and `backend/README.md`.
- Historical planning and superseded guidance live in `docs/archive/`.
- Dated QA reports live in `docs/qa/`.
- Research and design feedback snapshots live in `docs/research/feedback/`.
- `data/schema.md` is the detailed schema source of truth; architecture and product docs should not duplicate field-by-field schema definitions unless necessary.
- The factual importer automatically turns publisher-provided RSS/iTunes categories and keywords into up to twelve searchable source tags. They retain source provenance and refresh safely until a maintainer edits the managed `tags` field.
- The importer also retains source-backed runtime coverage, release scheduling, transcript detail, feed cadence, and production/feed facts. The public show page surfaces only next release, cadence, and transcript availability in its existing Facts & links card.
