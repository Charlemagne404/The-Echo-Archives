# 004 — Discovery intent and public URL state

**Status:** accepted for 2.0 v1<br>
**Baseline:** v1.2.7, 55ca3969

## Decision

Use the version-1 public intent shape in ../ARCHITECTURE.md: one optional stable show/entity identity, required criteria, preferred criteria, avoid criteria, residual text with unresolved phrases, field provenance, and a public route plus repeated key/value URL parameters. Public URLs keep the current page-specific route and parameter contracts; personal Library state is never serialized.

Interpret only deterministic criteria backed by current catalogue fields and the reviewed benchmark vocabulary. Exact identity remains stronger than taxonomy overlap. Unsupported or ambiguous phrases remain visible as residual text or ask for clarification; they are not silently turned into criteria.

## Why

The archive already has title/alias search, structured filters, explicit entity relationships, authored collections, similarity, and Back/Forward restoration. A typed envelope can compose those systems while preserving evidence and existing public links.

## Rejected alternatives

- An LLM query parser, vector database, fabricated enrichment, and generic recommender rewrite are outside the evidence and privacy contract.
- A serialized opaque query blob would obscure public links and make old URL state harder to preserve.
- Treating missing metadata as a match or a negative result would misstate catalogue evidence.
- Putting personal status, rating, opt-in, or recommendation reasons in the URL would expose private state.

## Revisit only if

The versioned benchmark demonstrates a repeated supported listener intent that cannot be represented with the current fields, or the authored catalogue adds a reviewed field that materially improves retrieval. Expand the schema and URL mapping together, with legacy round-trip coverage.
