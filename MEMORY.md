# Repo Memory

- The active repo-wide doc set is `README.md`, `AGENTS.md`, `docs/PRODUCT.md`, `docs/CURRENT_STATE.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/IMPORTER.md`, `docs/SEO.md`, `docs/TAG_TAXONOMY.md`, `data/schema.md`, and `backend/README.md`; `docs/FINAL_PRODUCT.md` is the destination vision and `docs/qa/` holds dated evidence.
- Historical planning and superseded guidance live in `docs/archive/`.
- Dated QA reports live in `docs/qa/`.
- Research and design feedback snapshots live in `docs/research/feedback/`.
- `data/schema.md` is the detailed schema source of truth; architecture and product docs should not duplicate field-by-field schema definitions unless necessary.
- The factual importer retains publisher-provided RSS/iTunes categories and keywords as provenance. Only deterministic mappings and approved taxonomy workflow may populate public genres, formats, or discovery tags; raw source keywords are not copied into public tags.
- The importer also retains source-backed runtime coverage, release scheduling, transcript detail, feed cadence, and production/feed facts. The public show page surfaces only next release, cadence, and transcript availability in its existing Facts & links card.
- The 1.0 catalog baseline is 724 published shows, 523 Imported records, 194 indexed-only records, 7 full reviews, and 38 collections. The current generated report has two undocumented runtime blockers for `big-grande-teachers-lounge` and `machina`.
- The protected collection engine supports rule-based and semantic definitions, candidate review, manual membership overrides, regeneration, and audit history without auto-publishing public memberships.
