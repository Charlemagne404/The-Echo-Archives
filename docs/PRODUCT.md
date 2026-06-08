# Product

## Purpose

This is the active product brief for The Echo Archives.

Use it as the source of truth for:

- product identity
- audience and positioning
- UX principles
- browse, show-page, and collection behavior
- ratings, trust, and contribution boundaries
- design and voice guidance

Historical planning variants live in `docs/archive/`.

## One-Sentence Vision

The Echo Archives is a human-curated discovery platform for audio dramas and fiction podcasts, built to help listeners find their next audio obsession by genre, mood, tone, format, length, similarity, and listening context.

## Core Identity

- Product name: **The Echo Archives**
- Parent brand: **Continental**
- Preferred relationship language:
  - "A Continental project"
  - "A product of Continental Studios"
- Avoid presenting the product as "Continental Echo Archives"

The archive should stand on its own as the user-facing product. Continental should stay present but quiet.

## Mission

General podcast apps are built for everything. Fiction gets buried in broad catalogs, weak metadata, and recommendation systems that do not understand tone, format, completion status, or listening intent.

The Echo Archives exists to solve that discovery problem directly by:

- helping listeners discover audio dramas worth their time
- making fiction podcasts easier to browse and compare
- giving shows useful context beyond title and cover art
- helping creators get represented accurately
- building a human-curated archive that feels specific, trustworthy, and alive

## Audience

Primary audience:

- listeners who already enjoy audio dramas and want better recommendations

Secondary audience:

- newer fiction-podcast listeners who need a curated entry point
- creators who want their shows surfaced in the right context

The archive should serve both deep fans and newcomers without turning into a generic database or a playback app.

## Product Principles

- Discovery comes first.
- The archive should help users decide what to hear next within a page or two.
- Structured metadata should support editorial judgment, not replace it.
- Indexed-only entries are permanent first-class records, not placeholders.
- Compact browsing is a feature, not a bug.
- Trust matters more than volume.
- Community and creator input should improve the archive without overruling editorial ownership.

## What The Product Should Feel Like

- cinematic
- archival
- dark but readable
- compact and practical
- cover-art-driven
- editorially guided
- creator-friendly
- built by someone who actually listens to this category

It should not feel like:

- a generic SaaS dashboard
- a bright podcast player
- a cold media database clone
- a startup-style social platform
- a neon cyberpunk gimmick

## Current Visual Direction

Preserve the existing visual language:

- dark black and charcoal background
- cinematic hero section
- radio telescope, signal, and archive atmosphere
- red and orange archive accents
- green community accents
- thin borders and rounded cards
- compact, dense browsing layout
- small but readable metadata
- editorial archive language

The browse page density is intentional. Improve polish, spacing, readability, and responsiveness without flattening the identity.

## Voice And Naming

Write like someone who genuinely likes audio dramas and wants to help other people find good ones.

Good traits:

- clear
- specific
- opinionated when useful
- welcoming without sounding fake

Avoid:

- corporate language
- algorithm worship
- SEO-farm tone
- overexplained neutral database copy

Assistant naming standard:

- **Ask the Archivist**

## Positioning

Useful lines:

- "Find your next audio obsession."
- "Podcast apps are built for everything. The Echo Archives is built for fiction."
- "A curated archive for audio dramas, fiction podcasts, and stories worth getting lost in."

The archive should feel adjacent to IMDb, Goodreads, Letterboxd, and MyAnimeList in usefulness, but it should not mimic any of them directly.

## Browse Page Rules

The browse page is the main discovery surface.

It should:

- get users to real shows quickly
- make filters useful without overwhelming the page
- keep cards compact and scannable
- expose multiple discovery paths without feeling bloated

The hero should support discovery, not dominate the page.

Cards may include:

- cover art
- title
- one or two key tags
- archive rating
- community rating
- compact status labels such as `Top Rated`, `Full Review`, `Creator Verified`, `New`, or `Archive Pick`

Avoid on default cards:

- long descriptions
- metadata dumps
- oversized badges
- repeated obvious labels
- unnecessary card-height variation

## Search And Filtering

Search and filters should help users discover shows by more than title when the data exists.

Relevant discovery inputs include:

- title
- creator
- genre
- tone
- tags
- format
- status
- runtime or commitment
- production style
- similar shows
- archive notes

Only expose filters backed by real data.

Empty states should route users toward:

- collections
- similar discovery paths
- Ask the Archivist prompts
- submit and correction flows when relevant

## Collections

Collections are curated listening paths, not generic genre bins.

They should be organized around:

- mood
- tone
- intent
- commitment level
- useful recommendation routes

Good examples:

- Best for long walks
- Serious sci-fi
- Cold isolation horror
- Funny space disasters
- Completed shows
- Shows like Derelict
- High-production audio dramas

Collections should feel editorial and purposeful, not filler.

## Show Pages

Show pages should carry deeper context that does not belong on compact browse cards.

Useful detail-page content includes:

- full description
- archive take or review
- archive rating
- community rating
- listen links
- official links
- tags
- runtime
- season and episode count
- release status
- format and narrator style
- similar shows
- collection appearances
- creator verification status
- metadata correction path

Indexed-only pages should still feel intentional and useful.

## Ratings, Reviews, And Trust

Keep these concepts distinct:

- Archive rating: editorial perspective
- Community rating: listener response
- Creator verified: factual metadata checked by a creator or official source

Creator verification must never imply creator approval of archive ratings, reviews, or rankings.

Listener reviews, creator notes, and archive editorial voice should stay visually and semantically separate.

Community features should remain moderated. Nothing user-submitted should auto-publish without explicit rules.

## Data Quality Rules

- Preserve the existing schema.
- Do not invent facts.
- Use `unknown`, blank values, or TODO notes when unsure.
- Keep objective metadata separate from editorial opinion and community content.
- Metadata quality beats raw volume.
- Indexed entries should grow faster than full reviews when needed, but never at the cost of obvious inconsistency.

## Submissions And Community

Supported contribution types may include:

- new shows
- metadata corrections
- listener reviews
- creator verification requests
- official links
- tag suggestions
- similar-show suggestions

Community contribution should stay quality-controlled and moderation-first.

Continental ID can be an optional trust layer, not a mandatory wall.

## Ask The Archivist

Ask the Archivist should recommend from the archive's own catalog, tags, ratings, reviews, collections, and structured metadata.

It should not:

- hallucinate shows
- present unverified facts as certain
- feel like a giant generic chatbot

The feature should stay subtle and archive-specific.

## Scope Boundaries

Do not prioritize these during the current product phase:

- streaming or playback features
- forums or comments-first community
- paid subscriptions
- native mobile apps
- heavyweight creator marketplace features
- a broad social product
- an overbuilt recommendation engine before the catalog is strong

The near-term win is a better archive, not a bigger platform.
