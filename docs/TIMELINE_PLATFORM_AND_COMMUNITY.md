# Timeline - Platform And Community

## Scope

This document covers the technical and operational work that supports the roadmap:

- catalog structure
- backend support
- moderation workflow
- ratings integrity
- testing and release safety
- SEO and archive health

## Platform Principles

- Keep the system boring and maintainable.
- Keep editorial truth in structured catalog data.
- Use lightweight workflow support before building a heavy admin product.
- Only add persistence layers when they solve a real workflow bottleneck.

## Phase 1 - Stable Public Beta

Platform:

- verify sitemap, robots, canonical tags, and route metadata across public pages
- add or tighten validation for show and collection data changes
- document manual release checklist for content updates

Community:

- document correction handling flow
- document anonymous rating policy and visibility threshold

Testing:

- keep regression coverage for catalog loading, sitemap generation, submissions, and ratings

Definition of done:

- publishing and correction intake are reliable enough for early public use

## Phase 2 - Catalog Depth And Editorial Coverage

Platform:

- extend schema support for recommendation reasons and richer collection metadata
- add helper scripts or tests for link validation and metadata consistency if missing

Community:

- keep ratings separate from editorial presentation
- ensure submit intake remains manageable as volume grows

Definition of done:

- the platform can support faster catalog growth without manual drift

## Phase 3 - Discovery Upgrade

Platform:

- support richer filter derivations from structured data
- support recently added and recently updated views from data timestamps
- consider a lightweight derived search index only if client-side search becomes clumsy

Ask the Archivist:

- improve grounding inputs from structured metadata rather than presentation text
- keep deterministic fallback behavior strong when model support is absent

Definition of done:

- discovery improvements are backed by durable data, not fragile UI-only logic

## Phase 4 - Contribution And Moderation Systems

Platform:

- add storage and moderation path for listener-review submissions
- add provenance support for creator-verified metadata
- add simple anti-spam controls for ratings and submit endpoints

Community:

- keep community average hidden until threshold is met
- prevent creator-verified state from implying endorsement of archive ratings

Definition of done:

- contribution systems are trustworthy without requiring a full admin dashboard

## Phase 5 - Creator, Network, And Archive Context Layer

Platform:

- add structured creator and network entities
- connect show records cleanly to those entities
- store changelog or update history in a structured, reusable format

Operations:

- define what stays in JSON versus what belongs in operational storage
- keep rollback simple for catalog and moderation changes

Definition of done:

- new entity layers do not create data duplication or new manual sync problems

## Phase 6 - Final-Vision Release Candidate

Platform:

- harden tests around browse routes, show rendering, collections, submissions, ratings, and sitemap output
- review performance on mobile and slower connections
- ensure failure cases degrade cleanly

Operations:

- define recurring QA pass for links, images, metadata quality, and empty-state behavior
- define release gate checklist for broader promotion

Definition of done:

- the archive is technically quiet enough that editorial growth becomes the main variable

## Deferred Platform Work

Do not pull these into the roadmap unless the archive materially outgrows the current model:

- full CMS migration
- account system
- public API
- forums or comments
- complex recommendation infrastructure
- native mobile apps
