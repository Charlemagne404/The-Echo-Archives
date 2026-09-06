# The Echo Archives — Comprehensive Read-Only Audit

Audit date: 2026-09-06  
Repository: /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives  
Audit scope: the current checkout, including authored source, generated public output, backend, tests, operational metadata, local application rendering, and the local SQLite workflow database.

## Audit metadata and evidence boundaries

| Item | Finding |
|---|---|
| Branch | main |
| HEAD at audit start | e8ce6d2755bc4fd2eb77f2bb852d144a1db37041 |
| HEAD subject | Add creator-page corrections and directory filters |
| HEAD commit time | 2026-09-06 12:55:09 +02:00 |
| Remote relation at audit start | main...origin/main; local and origin refs were aligned |
| Working tree before audit | Not clean. Extensive pre-existing tracked modifications affected generated pages, entity rendering/tests, docs, CSS, scripts, sitemap, service worker, and page manifest. |
| Audit artifacts before audit | Neither requested report nor snapshot existed |
| Root package version | No version field |
| Backend package version | 2.0.0 |
| Footer version | v1.1.2 |
| Architecture-document version | 1.1.0 |
| Effective catalog snapshot | 724 published show records in current data/shows.json; counts below are from the current checkout, not the clean HEAD commit alone |

The dirty working tree is a major interpretation boundary. This report describes what a reviewer would encounter in this checkout. It does not claim that every current behavior is represented by the recorded HEAD commit. I did not stage, revert, overwrite, or normalize any pre-existing change.

### Sources inspected

The audit used the following evidence classes:

- Authored catalog: catalog-src/shows/*.json, catalog-src/collections/*.json, catalog-src/entities.json, order manifests, and optional review sources.
- Generated catalog/runtime data: data/shows.json, data/collections.json, data/entities.json, data/search-index.json, data/archive-stats.json, generated catalog status files, generated HTML, sitemap.xml, robots.txt, route CSS, and browser assets.
- Data contracts and product/operations documentation: README.md, docs/PRODUCT.md, docs/ROADMAP.md, docs/ARCHITECTURE.md, docs/OPERATIONS.md, docs/IMPORTER.md, docs/CREATORS.md, docs/SEO.md, data/schema.md, and generated status reports.
- Runtime and rendering code: backend/server.js, backend/lib/**, shared/**, site-src/**, and tools/build-pages.js.
- Backend storage and workflow code: SQLite schema/migrations, import services, collection services, community/rating/review services, submission services, configuration, deployment definitions, and .env.example variable names.
- Tests and static validation: focused SEO, sitemap, submission, output, image, and responsive tests; git diff --check; read-only scripts for catalog, route, graph, asset, and completeness counts.
- The local SQLite file was opened read-only through the existing dependency. Operational aggregates were inspected without exposing profile IDs, hashes, source payloads, or secrets.
- The application was rendered locally at desktop and mobile widths through the already-connected Brave browser. A temporary server outside the repository used the existing catalog/rendering modules and disabled cover fetching; community API responses were stubbed read-only for rendering inspection.

### Not inspected or not proven

- No production website, Cloudflare account, DNS, TLS, CDN cache, Search Console, Plausible account, Cloudflare RUM dashboard, server logs, or production database was accessed.
- No external URL was fetched for reachability. URL syntax was checked locally, but a syntactically valid RSS, Apple, Spotify, or official-site URL is not proof that the remote resource currently responds.
- No full external competitor analysis or external keyword research was performed. The handoff section is intentionally a research brief.
- The requested Playwright browser runner could not launch because Google Chrome is not installed. I did not install Chrome or any dependency. Visual inspection used the existing connected Brave surface instead.
- The full npm verify, page build, catalog build, import/update jobs, database migrations, and backend smoke suite were not run. Build/import commands can write generated artifacts or workflow state; they were outside this read-only audit boundary.
- Live community writes, Turnstile, maintainer authentication, Ollama/Archivist behavior, production importer execution, creator submissions, and deployment routing remain unproven.
- Secret environment values were intentionally not read or included. Only variable names and code-level purposes are reported.

### Assumptions

1. data/shows.json, data/collections.json, and data/entities.json are the current generated public snapshot used by the application.
2. A non-empty field is counted only when it contains meaningful content; structural empty objects such as the ubiquitous quote or availability scaffolds are not treated as editorial content.
3. “Community usage” means the local SQLite artifact only. It is not a production-traffic or production-user claim.
4. Where current documentation and implementation disagree, the implementation/current generated data is treated as the stronger source and the discrepancy is recorded.
5. “Indexed” below means intended/indexable under local route and sitemap rules, not confirmed Google/Bing indexing.

### Evidence labels used in this report

- PUBLIC / SHIPPED — appears in the public route/output model and rendered locally.
- IMPLEMENTED / HIDDEN — code and/or protected route exists, but it is not part of the normal public listener journey.
- PARTIAL / EXPERIMENTAL — user-facing or wired in, but coverage or runtime dependencies are incomplete.
- LEGACY — compatibility or stale output retained for migration/backward compatibility.
- SCAFFOLDING — schema, service, or configuration exists for a future or protected workflow but does not currently produce the corresponding public experience.

## 1. Executive overview

### What Echo is today

The Echo Archives is a dark, static-first discovery archive for audio dramas and fiction podcasts. Its visible promise is direct: “Find your next audio drama or fiction podcast.” The product is built around helping a listener move from a vague desire, a familiar show, a mood, or a practical listening situation to a specific show worth opening.

The current product is not merely a list of podcast titles. It combines:

- a 724-show public catalog;
- compact cover-art cards and a cinematic radio-telescope/archive presentation;
- nine canonical genres plus tones, formats, listening-context tags, themes, content notes, languages, status, runtime, and release metadata where available;
- 46 curated, similarity, and rule-based collections;
- seven full editorial reviews and a much larger imported/indexed-only factual catalog;
- explicit similar-show relationships and reason text;
- a typed organization/entity registry for 40 visible production companies, studios, and networks, plus two person entity pages hidden from the directory;
- separate archive ratings and community ratings/reviews;
- source/provenance fields and a moderation-first contribution path;
- a backend import and collection workflow that is substantially richer than the public interface.

The public product is therefore best understood as an editorial discovery layer over a structured catalog, with a protected operations system being built underneath it.

### Target audience inferred from implementation

The clearest audience is an audio-fiction listener who already knows that ordinary podcast directories are poor at answering “what should I listen to next?” The interface emphasizes:

- fiction rather than general podcast categories;
- discovery by tone, commitment, use case, and format;
- “Shows like [known show]” entry points;
- completed versus ongoing listening decisions;
- production style, voice-acting, sound design, narrative form, and runtime;
- trustworthy links and factual source notes;
- obscure or long-tail shows that are unlikely to be found through a generic popularity chart.

Secondary audiences are creators, production companies, studios, networks, and maintainers. The creator-facing route is primarily a trust and correction/verification funnel today, not a creator analytics or marketing product.

### Primary use cases actually supported

1. A listener opens the homepage and starts from a known favorite or a curated route.
2. A listener searches by title, creator string, genre, tone, tag, format, status, content note, or similar-show phrasing.
3. A listener filters the archive and scans dense cards.
4. A listener opens a show page to decide whether to start, including runtime, format, status, official description, links, review/rating, facts, and next suggestions.
5. A listener moves from a show to a similarity route, related show, creator/entity page, or collection.
6. A listener checks a creator/organization’s connected show catalog.
7. A listener contributes a show, metadata correction, listener review, or creator verification request, all subject to moderation.
8. A maintainer/import operator evaluates source-backed candidates and collection membership without automatically publishing them.

### Product philosophy inferred from code and data

The implementation consistently favors “structured, trusted, compact, and editorial” over “maximally social” or “maximally broad.” The strongest signals are:

- a canonical authored source separate from generated output;
- explicit confidence/review states: full-review, indexed-only, and imported;
- importer rules that prohibit subjective editorial fields on imported records;
- source URLs, verification dates, objective-source arrays, and research-gap tracking;
- collection reasons and anchor shows;
- a moderation-first submission queue;
- separate archive and community ratings;
- no forced account layer;
- no auto-publish path from public intake;
- static generation and committed public HTML for fast, crawlable delivery.

The architecture documents the intended constraint well: broaden catalog coverage without weakening trust or overbuilding. The product is trying to be a reliable discovery/editorial layer, not an open directory whose raw metadata is accepted as truth.

### Difference from a generic podcast directory

Echo’s differentiators are currently qualitative and structural rather than scale-based:

- It models audio-fiction-specific decisions such as narrative structure, narrator style, sound design, serialized versus episodic format, mood, commitment, and “best for” listening situations.
- It makes editorial perspective and community response visibly separate.
- It exposes indexed-only records as factual, source-backed entries instead of presenting thin imported metadata as a full human recommendation.
- It uses purpose-led collections such as long walks, serious sci-fi, cold isolation horror, easy first steps, and funny space disasters.
- It has explicit reasoned similarity links and “Shows like…” routes.
- It has a typed, source-reviewed entity registry rather than treating every raw creator/network string as a public creator page.
- It is deliberately dense and cinematic, not a bright utility dashboard.

The limitation is that the differentiated layer is unevenly distributed. Only 7 shows have full reviews, 71 have outgoing similar-show data, 243 are in at least one public collection, and 172 connect to the typed entity registry. Most of the 724-show breadth is factual catalog coverage rather than deeply editorial discovery.

### Apparent business/project goals

No business model is proven by the repository. The implementation suggests these project goals:

1. Become a trusted specialist index for audio drama and fiction discovery.
2. Capture long-tail organic traffic through show, creator, collection, and similarity pages.
3. Build a durable structured catalog whose metadata can be corrected, sourced, imported, and regenerated safely.
4. Grow creator/production-company trust through factual verification and correction workflows.
5. Encourage listener contributions without making the public experience account-gated.
6. Eventually support better archive-specific recommendations using structured relationships and source quality.
7. Keep operating cost and complexity low through static delivery, local SQLite workflow state, and optional local AI rather than a mandatory hosted AI dependency.

Supporter/Ko-fi links, the Continental footer, and creator-facing trust language exist, but there is no demonstrated revenue funnel, subscription system, sponsorship system, or commercial creator product.

### Current maturity level

The project is beyond a prototype in breadth and infrastructure but not yet mature as a recommendation network:

- Public surface: coherent, crawlable, responsive, and visibly usable.
- Catalog breadth: substantial at 724 published records.
- Editorial depth: concentrated in 7 full-review shows and a small number of curated routes.
- Relationship graph: real but sparse; typed entity links cover 172 shows and explicit similarity covers 71.
- Operations: unusually developed for the visible product, with import candidates, evidence, audit events, queueing, rule-based collections, review gates, and protected maintainer routes.
- Community: implemented as a trust-controlled capability but locally empty for published reviews and active rating submissions.
- Analytics: hooks/configuration exist, but historical usage data is not in the repository and generated local pages do not currently contain the optional Plausible script.
- Deployment: assumptions and service/proxy files exist, but live production behavior was not verified.

This is best described as a serious v1/v1.1 static archive with v2 operational infrastructure, not as a finished personalized discovery platform.

### Strongest parts

1. Catalog/source separation. Authored source, generated runtime data, committed HTML, and operational SQLite state have clear intended boundaries.
2. Trust model. Imported/indexed-only/full-review states reduce the risk of pretending machine-found data is human editorial judgment.
3. Purpose-led discovery. The collection model is more useful than a flat genre taxonomy and already has anchor/reason fields.
4. Show detail anatomy. A high-quality show page gives a listener enough decision information to start or defer a show.
5. Static/SEO foundation. Clean canonical routes, sitemap generation, server-rendered dynamic detail pages, structured data, and no-JS-friendly HTML create a strong acquisition base.
6. Moderation and provenance infrastructure. Public submissions, creator verification, importer evidence, and collection audit trails are designed to avoid silent data corruption.
7. Visual identity. The archive/radio/signal language is recognizable and remains consistent across the main listener routes.

### Weakest parts

1. Editorial depth is too thin relative to the catalog promise. 517 records are imported and 200 indexed-only; only 7 have full reviews and only 27 have archive numeric ratings.
2. Discovery graph coverage is sparse. 481 shows are in no collection, 653 have no outgoing similar-show relationship, and only 172 connect to first-class entities.
3. Creator identity is mid-migration. 645 raw creator display strings coexist with a 42-record typed registry; 552 records still rely on legacy/fallback creator presentation rather than explicit entity links.
4. Data vocabulary is visibly inconsistent. Format casing creates duplicate filter choices; metadata richness varies dramatically; unknown and unclear dominate lifecycle fields.
5. Community and analytics do not yet provide product feedback loops. Local operational data has 20 rating events but no active rating submissions or published listener reviews; no historical usage data is present.
6. Build/output duplication creates maintenance risk. Authored source, generated root HTML, dynamic templates, route CSS bundles, legacy HTML, and compatibility aliases all coexist.
7. Documentation is stale in places. The architecture document still cites 38 collections, 523 imported, 194 indexed-only, and blocking quality errors while current generated status says 46 collections, 517 imported, 200 indexed-only, and Gate B complete.

### Major opportunities already implied by the architecture

These are not proposed implementations in this audit; they are capabilities the current model already points toward:

- reasoned, source-aware show similarity;
- a stronger entity graph across people, companies, studios, networks, and publishers;
- collection and relationship coverage as a recommendation substrate;
- factual “why this matches” explanations using shared attributes and human-authored reasons;
- a catalog-quality score that combines completeness, provenance, freshness, and editorial confidence;
- creator pages as acquisition and trust surfaces;
- long-tail SEO templates for show intent, similarity intent, collection intent, and creator intent;
- importing at scale while preserving a human gate before public publication;
- anonymous community signals without accounts;
- a future taste profile without having to replace the current authored catalog.

## 2. Complete feature inventory

### Feature classification summary

| Feature | State | What exists |
|---|---|---|
| Homepage and browse | PUBLIC / SHIPPED | Static/SSR shell with hero, search, filters, stats, popular/recent bands, featured collections, and archive results |
| Search | PUBLIC / SHIPPED, client-side | Tokenized title/metadata search with aliases, prefixes, limited edit-distance tolerance, scoring, and natural-language similarity patterns |
| Filtering | PUBLIC / SHIPPED | Genre, format, tone, listening context, archive status, and tags; AND across filter groups, OR within a group |
| Collection directory | PUBLIC / SHIPPED | 46 collections, intent filters, query, six sort modes, featured and similarity sections |
| Collection detail | PUBLIC / SHIPPED | Resolved show membership, reasons, anchor route behavior, related collections, SEO gating |
| Show detail | PUBLIC / SHIPPED | Dynamic clean URL, SSR/HTML anatomy, full and indexed-only variants, ratings, facts, links, related routes |
| Creator/entity directory | PUBLIC / SHIPPED | 40 organization cards, type filters, query, name/show-count sort |
| Creator/entity detail | PUBLIC / SHIPPED | 42 registry pages, including two directory:false people pages reachable from show/entity routes |
| Similar-show routes | PUBLIC / SHIPPED but sparse | 17 similarity collections and 234 directed similarTo edges |
| Archive reviews/ratings | PUBLIC / SHIPPED for 7 reviewed shows | 7 full-review companions; archive rating breakdowns on 27 shows |
| Listener ratings | IMPLEMENTED / PARTIAL | API, anonymous profile, one-rating-per-profile model, abuse controls, UI; local snapshot has no active submissions |
| Listener reviews | IMPLEMENTED / PARTIAL | Intake, moderation storage, published-review renderer, helpful votes; local snapshot has zero published reviews |
| Transcript metadata | PUBLIC / SHIPPED as metadata | Availability/language rows; no transcript reader or transcript corpus |
| Provenance | PUBLIC / SHIPPED but unevenly visible | Source/verification data is stored broadly; show pages disclose some source-backed state |
| New-show submission | PUBLIC / SHIPPED intake | Moderation-first form and backend validation |
| Correction submission | PUBLIC / SHIPPED intake | Show and creator-page correction modes, source links and subtype fields |
| Creator verification | PUBLIC / SHIPPED intake | Evidence-based request path; no automatic verification |
| For-creators content | PUBLIC / SHIPPED | Standards/trust and contribution explanation, not a creator dashboard |
| Maintainer queue/import/collection operations | IMPLEMENTED / HIDDEN | Protected routes and SQLite-backed workflow |
| Ask the Archivist | PARTIAL / DISABLED BY DEFAULT | Lazy-loaded chat path, sessionStorage history, optional local Ollama; launcher is removed when disabled |
| Sharing | PUBLIC / SHIPPED | Native share when available, clipboard fallback, inline status/toast |
| Visual themes | NOT IMPLEMENTED as a user feature | Dark-only presentation; themes in data are content metadata |
| Accounts/login | NOT PRESENT in listener UI | Anonymous community profile only; no public account, identity, saved profile, or Continental ID requirement found |
| Saved lists/personalization | NOT PRESENT | No favorites, queues, follows, taste onboarding, or personal library |
| Analytics dashboard | NOT PRESENT publicly | Optional analytics integration/configuration and operational instrumentation, but no local historical dashboard |

### Homepage

The homepage is the principal discovery surface. It presents:

- compact site header and navigation;
- cinematic hero with radio telescope/signal artwork and archive language;
- primary heading “Find your next audio drama or fiction podcast”;
- three start-here routes based on favorite-show similarity or listening status;
- archive search;
- filter controls and quick filter chips;
- archive statistics;
- browse result cards;
- most popular and recently added bands;
- featured collection carousel;
- similarity collection carousel;
- footer/legal/supporter links.

Data comes from generated search index, shows, collections, and archive statistics. The home page is mostly deterministic. Popular can incorporate community summaries if live API data exists; with local empty summaries and zero meaningful popularity scores, the fallback initial cards are predetermined show IDs. Recently added sorts by catalog publication/update metadata, which is not identical to the show’s original release date.

### Browse and results

The browse panel initially renders 60 cards and exposes a load-more path. Search/filter state is URL-addressable. Results are selected from all 724 published records in the browser; there is no server search endpoint.

The card-level information is intentionally compact: cover, title, a small number of tags/status/rating treatments, and interaction affordances. Long descriptions and most provenance/facts are deferred to show pages.

Filter groups currently visible in the browser:

- Story type: 9 genres and 12 format values as rendered, although several are casing duplicates.
- Tone: the current observed tone vocabulary.
- Listening context: 11 bestFor values.
- Archive status: review/release/completion-related choices exposed by the client.
- Find tags: the currently used tag vocabulary.

Filters combine as AND across groups and OR within a group. Query matching is scored, while filters are inclusion constraints. Results may therefore contain a high-scoring search match only if it also satisfies every active group.

### Search

Search fields are broader than the visible card:

- title, subtitle, aliases;
- genres, tones, formats, tags, best-for, themes, content notes;
- creators, cast, languages, transcript languages;
- narrator, transcript availability, content/facts/credits;
- completion/review metadata;
- similar-show titles;
- descriptions and other full-text fields.

The search index is hydrated client-side from data/search-index.json. It includes normalized tokens and full text, expands known aliases such as sci fi, full cast, single narrator, completed, ongoing, full review, and listening-context phrases, and applies exact/partial/prefix/fuzzy scoring. Fuzzy tolerance is limited by token length and first-character matching; it is not a general-purpose fuzzy search service.

The parser recognizes natural-language patterns such as “shows like X,” “like X,” “similar to X,” and “what is X similar to.” It resolves a seed show title and searches the similarity/title index. The UI still returns show cards, not a separate recommendation explanation experience.

### Collections

The current public collection directory contains 46 collections:

- 20 curated collections;
- 17 similarity collections;
- 9 rule-based collections.

The page exposes intent chips, query search over collection and member-show metadata, and sort modes: editorial, newest, rating, popularity, title, and show count. Collection detail pages show their resolved membership, show reasons where present, and related collection routes. Six collections are featured.

Collection membership is a resolved snapshot in the public JSON. Rule and semantic definitions, candidate evidence, confidence, manual overrides, and audit history live in the backend workflow model. In the current public snapshot there are 620 membership rows covering 243 unique shows; the local SQLite artifact contains 557 rule-match evidence/membership rows, which is operational evidence rather than a replacement for the published snapshot.

### Show detail pages

Show pages are the deepest listener decision surface. Depending on record richness and review status, they may contain:

- breadcrumb and title/subtitle;
- review/status chips;
- cover art with responsive variants;
- archive rating and listener rating state;
- runtime, format, lifecycle status, season/episode summary;
- Start/Open/Archive note/Facts & links/Share actions;
- Best for listening-context strip;
- official description or indexed-only disclosure;
- archive review and/or listener review;
- archive score breakdown;
- community rating/review module;
- factual metadata and release dates;
- creators, networks, production information, and source-backed facts;
- official and listening-platform links;
- transcript availability;
- similar shows with reason text;
- collection appearances;
- More from entity route when a confirmed typed relationship exists;
- factual correction CTA.

The page uses a richer editorial layout for full-review records and a transparent indexed/imported layout for source-backed records without archive opinion.

### Entity, creator, studio, and network pages

The typed entity system is new and intentionally narrower than the raw legacy creator data:

- /creators shows 40 organization records by default: 28 production companies, 3 studios, and 9 networks.
- /creators/:stable-id exposes all 42 registry records, including K.A. Statz and Travis Vengroff with directory:false.
- Directory filters are all, production company, studio, and network.
- Search covers entity name and aliases; matching is token-based, not fuzzy.
- Sort modes are name and connected-show count.
- Detail pages show source-backed connection status, website, role, connected-show count, listening routes, genres represented, aliases, related collections, and a correction CTA.
- More from on show pages uses only explicit typed links and a role-priority/connected-show rule.

Raw creators, creatorId, networkId, and credits continue to render as fallback facts and search fields but do not automatically create public entity pages.

### Recommendations and related routes

Echo currently has several recommendation-like mechanisms, but most are authored or deterministic:

- three hardcoded homepage starting routes;
- explicit similarTo arrays with optional reason strings;
- 17 similarity collections with anchor shows;
- collection membership;
- same-entity More from connections;
- related collections on show pages;
- Try next similar cards;
- search interpretation of shows like X;
- popular/recent homepage bands;
- archive reviews and ratings as decision-support signals.

There is no evidence of a learned recommender, user-level ranking model, collaborative filtering, embedding index, or personalized feed.

### Reviews and ratings

Archive opinion is inline or in review companions. The current full-review set is 7. Archive rating values are 1–10 and include a six-category breakdown in the page renderer: voice acting, sound design, story, characters, ads, and length.

Community ratings are separate. The backend stores an anonymous profile, one active rating per show/profile, event history, abuse signals, and minimum-public-threshold rules. The UI supports a 1–10 quick rating flow. Listener reviews are 1–5 stars with optional detailed 1–10 category scores, spoiler level, best-for/context data, helpful votes, and moderation publication state.

The local database has 20 rating events, one distinct podcast/show ID, zero active rating submissions, and zero published listener reviews. This is not evidence of production adoption.

### Transcripts and provenance

Shows expose transcript availability and transcript-language metadata when known. Only 43 records have non-empty transcript language metadata, and the static snapshot has no transcript reading/searching route. This is a discovery fact, not a transcript product.

Provenance is a real data dimension:

- official description source label/URL/verified date;
- show verification status/date/source/note;
- objective source arrays;
- importer metadata and field-level evidence in SQLite;
- source categories/keywords;
- research gaps and runtime gaps;
- creator/entity source URLs and reviewed dates.

Not all provenance is equally visible on every page; the richer operational evidence remains protected.

### Submission and creator workflows

The public /submit route has four modes:

1. Submit a new show.
2. Suggest a correction.
3. Submit a listener review.
4. Request creator verification.

The form collects different fields per mode, including title and source link for a new show, existing show and subtype for corrections, review/rating/spoiler data for listener reviews, and role/evidence/official links for creator verification. Hidden honeypot, legal acknowledgement, mode synchronization, and source fields are present.

The backend validates mode, links, known show IDs, correction subtype, legal version, honeypot, rate limits, and creator-verification evidence. Accepted submissions are stored in show_submissions; nothing in the public path automatically alters catalog-src.

### Navigation, mobile, sharing, and utility pages

Desktop navigation is compact and archive-oriented. Mobile uses a full-height drawer with focus trap, Escape close, body scroll locking, aria-expanded, aria-controls, and aria-hidden management. The mobile navigation includes Browse, Collections, Creators, About, Submit, For creators, standards, Support, Help Center, Contact, and legal pages.

The share control uses navigator.share where available and clipboard fallback otherwise. There is no visible theme toggle; all pages declare dark color scheme. About, help, creator standards, supporter, legal, and 404/500/offline routes are present, with utility/maintainer routes generally noindexed.

### Hidden, partial, legacy, and future-facing systems

Implemented but hidden or protected:

- maintainer submission queue and reports;
- import candidates, source cache, field evidence, jobs, runs, and explicit publication;
- rule/semantic collection candidate generation and regeneration;
- protected community configuration and moderation state;
- optional chat/Archivist endpoints;
- data endpoints for shows/search/collections and health.

Partial or experimental:

- Archivist chat, disabled by default and dependent on optional local Ollama;
- community ratings/reviews, code-complete but locally empty and deployment-config dependent;
- creator verification, intake-complete but not automatic and not shown as verified in the current 724-show snapshot;
- typed entities, public for 42 reviewed registry records but covering only 172 shows;
- automated collections, operationally richer than the public resolved snapshots.

Legacy:

- /show?id=... and /collection?id=... query aliases;
- old detail HTML artifacts under three shows/... paths;
- legacy creator/network fields;
- unpopulated optional data/creators.json, data/networks.json, and data/changelog.json paths;
- a generated contact.html artifact not listed in the current page manifest.

Future-facing scaffolding:

- semantic collection definitions scored through local AI;
- importer discovery sources/jobs, currently empty for the discovery-specific tables;
- evidence-backed creator/entity expansion;
- optional review companions and changelog;
- richer AI archive context loaders.

## 3. Route and page inventory

### Canonical public route families

| URL pattern | Purpose | Rendering/data | SEO/indexing | Main relationships/behavior |
|---|---|---|---|---|
| / | Homepage/browse | Generated HTML shell, browser modules, data files | Index/follow; title/description/OG/Twitter/canonical | Links to shows, collections, similarity routes, submit |
| /about | Product/about explanation | Generated static page | Index/follow | Footer/navigation route |
| /for-creators | Creator-facing standards and contribution context | Generated static page | Index/follow | Links to standards, submit, creator verification/correction intent |
| /creator-standards | Creator verification/metadata standards | Generated static page | Index/follow | Supports creator trust workflow |
| /supporters | Supporter/Ko-fi page | Generated static page | Index/follow | Supporter CTA/footer |
| /help-center | Help and contribution guidance | Generated static page | Index/follow | Links to submit and product explanations |
| /collections | Collection directory | Static shell plus browser data | Index/follow; query/filter states noindex/follow | Links to collection detail and shows |
| /collections/:id | Collection detail/listening route | Backend server render from generated collections/shows | Index only if description, size, and reason gates pass; otherwise noindex/follow | Collection to show cards; related collection links |
| /creators | Organization/entity directory | Server-rendered directory plus client controls | Default index/follow; non-default query/filter/sort noindex/follow | Directory to entity detail to shows |
| /creators/:stable-id | Entity detail | Backend render from data/entities.json and explicit show links | Index if public, indexable, and at least 2 linked shows | Entity to shows, collections, official site, correction |
| /shows/:show-id | Show detail | Backend SSR/HTML renderer plus showBootstrap hydration | Index/follow for published show; missing show 404/noindex | Show to creators, collections, similar shows, external platforms |
| /submit | Moderated contribution intake | Generated static form plus backend POST | Page index/follow; submission API not indexable | Routes into SQLite moderation queue |
| /privacy | Privacy notice | Generated static page | Index/follow | Footer/legal |
| /terms | Terms | Generated static page | Index/follow | Footer/legal |
| /cookies | Cookie policy | Generated static page | Index/follow | Footer/legal |
| /copyright | Copyright | Generated static page | Index/follow | Footer/legal |

### Compatibility, operational, and hidden routes

| Pattern | State and behavior |
|---|---|
| /show and /collection | Legacy/template aliases. Query forms such as /show?id=derelict and /collection?id=... redirect to clean canonical routes by the backend. |
| Legacy HTML under /shows/.../*.html | Three generated legacy artifacts were present: Impact Winter, Ars Paradoxica, and Oz 9. They are compatibility output rather than the canonical sitemap/internal-link model. |
| /sitemap.xml | Generated XML contains 819 URLs: 13 static public URLs, 724 show URLs, 42 entity URLs, and 40 indexable collection URLs. |
| /robots.txt | Allows /; disallows /api/ and /maintainer/; points to https://echoarchives.net/sitemap.xml. |
| /404.html, /500.html, /offline.html | Utility/error/offline pages; noindex or non-indexable treatment. |
| /api/health, /api/chat, /api/community/**, /api/reviews/**, /api/submissions/shows | Backend API surface; APIs are not search landing pages. |
| Generated data endpoints | Data-serving endpoints are protected from indexing and use cache headers according to server configuration. |
| /maintainer/submissions.html and report | Protected moderation queue and individual submission reports. |
| /maintainer/imports.html and report | Protected importer queue, evidence, candidate preparation, and reporting. |
| /maintainer/collections.html | Protected collection candidates, memberships, overrides, regeneration, and audit. |

### Dynamic URL examples observed or generated

- /shows/derelict
- /shows/the-callisto-protocol-helix-station
- /shows/the-rapscallion-agency
- /shows/the-white-vault
- /collections/shows-like-midnight-burger
- /collections/shows-like-welcome-to-night-vale
- /collections/best-for-long-walks
- /creators/fool-and-scholar-productions
- /creators/k-a-statz
- /creators/travis-vengroff

The final URLs are slug/id based. Show IDs are generally stable lower-kebab IDs; entity IDs use a stable-id regex; collection IDs are authored identifiers. The slug strategy is strong for internal consistency but still requires preserving old redirects if titles or IDs change.

### Internal navigation graph

The intended visitor path is a real graph rather than a set of isolated pages:

~~~text
Homepage
  ├── search/filter results ──> Show
  ├── start-here route ───────> Show / similarity collection
  ├── popular/recent ────────> Show
  ├── featured collection ───> Collection ──> Show
  └── similarity collection ─> Collection ──> Show

Show
  ├── creator/entity facts ──> Entity ──> connected Shows
  ├── collections ──────────> Collection ──> other Shows
  ├── Try next/similar ─────> other Show
  ├── related collections ──> Collection
  ├── external listen links ─> Apple/Spotify/RSS/site
  └── correction/review ────> Submit

Collection
  ├── show cards ────────────> Show
  ├── show reasons/anchor ──> similarity explanation
  └── related collections ──> other Collection

Entity
  ├── connected show list ───> Show
  ├── related collections ──> Collection
  └── correction ────────────> Submit
~~~

This is a meaningful entity/discovery graph, but it is not yet dense enough for every record to participate. The strongest paths are concentrated around reviewed/popular anchors and a small organization pilot.

## 4. Actual data model

### Canonical storage layers

The repository explicitly separates four data roles:

1. catalog-src/ — authored canonical source for shows, collections, entities, and review companions.
2. data/ — generated public/runtime JSON.
3. Root HTML/CSS/JS — generated public output and stable delivery assets.
4. backend/data/community.sqlite — workflow/community/import/collection operational state.

The schema states that the frontend, optional Archivist, and community features should read generated files rather than scrape HTML. Operational tables are deliberately not the editorial source of truth.

Primary references: data/schema.md:5-30, data/schema.md:161-178, docs/ARCHITECTURE.md:20-45, docs/ARCHITECTURE.md:313-349.

### Show entity

The authored show shape is broad and mostly optional after the publication minimum:

| Field/group | Role and current meaning |
|---|---|
| id | Stable show identifier/slug. Used for route, generated lookup, links, similar references, and collection membership. |
| title, subtitle, description | Core public identity and archive description. Published description requires at least 40 characters. |
| officialDescription | Optional official/creator/network/platform wording plus sourceLabel, sourceUrl, and verifiedAt; distinct from archive-written description. |
| cover, coverAlt | Authored cover reference and accessible alt text; cover sync can generate local variants. |
| status | Publication state, principally published or draft. Current runtime has 724 published, 0 drafts. |
| reviewStatus | Editorial/data confidence: full-review, spotlight, indexed-only, imported, planned. Current: 7 full-review, 200 indexed-only, 517 imported. |
| releaseStatus | Show lifecycle: active, completed, hiatus, inactive, unknown. |
| completionStatus | Completion state: ongoing, finished, cancelled, unclear. |
| listenLinks | start, spotify, apple, website, rss; runtime records also carry some platform-specific extras. |
| genres | Canonical show genres. Nine observed values. |
| tones | Mood/tonal descriptors. Ten observed values; only 73 shows have any. |
| formats | Serialized/episodic/full-cast/narrated/anthology/limited-series and related values. Vocabulary casing is inconsistent. |
| tags | Approved discovery labels. 134 currently used values; documented taxonomy has 165 labels. |
| aliases | Alternate titles/search strings. 688 shows have meaningful aliases. |
| themes, contentNotes | Deeper discovery/content-sensitivity fields; present on 82 and 75 shows respectively. |
| languages, transcriptLanguages | Language and transcript-language metadata. 720 are English; 43 have transcript-language data. |
| length | Human label plus seasons, episodes, avgEpisodeMinutes, totalHours; it is aggregate metadata, not episode entities. |
| releaseDates | first, latest, and occasional notes; no first-class season/episode release timeline. |
| ratings | Archive rating and component values, distinct from community. 27 records have meaningful archive ratings. |
| facts | Narrative structure, narrator, ads, favorite run, relisten, and other factual/editorial decision helpers. |
| bestFor | Listening-context labels such as late-night, long-walks, headphones-on, easy-entry, binge-listening. |
| similarTo | Directed references to other show IDs. 234 valid outgoing edges across 71 shows. |
| similarReasons | Per-target explanation strings; current validator requires valid relationships/reason coverage. |
| archiveTake, spoilerFreeReview, thoughts, quote | Human editorial fields. Imported records are prohibited from carrying these as archive-owned content. |
| officialLinks | Website, Patreon, Discord, YouTube, merch, social/funding links and runtime extras. |
| credits | Creator name, cast, writer, director, producer, sound design, composer, production company, network, cover art and related credit fields. |
| entityLinks | Explicit typed relationship list to registry IDs and roles. This is the preferred new relational model. |
| verification | Status/date/source/note, currently populated for all 724 records but with varied status quality. |
| availability | Transcripts, captions, region notes. Usually structurally present even when values are unknown. |
| content | Setting, POV, source material, intensity. Sparse. |
| metadata | Awards, schedule, import/provenance fields, research gaps, source categories/keywords, latest feed item, runtime gap notes. |
| popularity | Optional score. Current meaningful static score count is 0. |
| featured | Optional homepage/editorial flag. Eleven true records in the current runtime. |
| createdAt, updatedAt | Catalog publication/edit timestamps; all 724 have both. |
| creatorId, networkId | Legacy/compatibility identifiers. They do not automatically resolve to the new entity registry. |
| accent | Visual accent data, prohibited/absent on imported records and present only in richer authored data. |

Publication validation requires a stable ID, title, description, cover/resolved cover, alt text, status, review status, genres, tags format, and updated date, with further conditional validation. Imported records require importer provenance, verification.status: automated-source-checked, and no archive-owned editorial fields. Similarity and collection references must resolve.

### Enums, requiredness, and validation rules

The most important concrete contracts are:

| Dimension | Allowed/current values or rule |
|---|---|
| Publication status | published, draft |
| Review status | full-review, spotlight, indexed-only, imported, planned |
| Release status | active, completed, hiatus, inactive, unknown |
| Completion status | ongoing, finished, cancelled, unclear |
| Entity publication | public, draft |
| Entity type | person, production-company, studio, network |
| Entity relationship role | creator, production-company, studio, network |
| Collection kind documented | curated, editorial, similarity, rule-based, semantic; current runtime uses curated, similarity, rule-based |
| Archive rating | numeric 1–10 when present; component ratings are numeric and validated |
| Listener review headline | integer 1–5 stars |
| Listener detailed scores | optional integers 1–10 |
| URLs | HTTP or HTTPS, no embedded username/password; specialized Apple ID/link rules apply |
| IDs | stable lower-kebab-like IDs for shows/entities; unique show/collection/entity references |
| Dates | strict valid ISO-like dates where required; first release cannot follow latest |
| Published description | at least 40 characters |
| Published tags | canonical approved taxonomy, 2–48 characters, bounded count, no duplicate normalized values |
| Similarity references | targets must exist, cannot self-reference/duplicate, and reason coverage is validated |
| Collection references | showIds/coverShowIds/intentTags unique after normalization; cover IDs must be members; similarity collections need a valid anchor |
| Public entity | source URLs and reviewed date required; draft entities cannot be indexable |

Many other show fields are optional by design. The optionality is what permits imported/indexed-only records to remain factual when sources do not expose runtime, tone, transcript, cast, awards, or lifecycle details. It also creates the completeness differences measured later in this report.

### Confidence/lifecycle dimensions are separate

The model correctly keeps these concepts distinct:

- status: whether Echo publishes the record;
- reviewStatus: how much Echo has editorially reviewed or imported it;
- releaseStatus: whether the show is active/completed/on hiatus/inactive/unknown;
- completionStatus: whether the narrative/listening run is ongoing/finished/cancelled/unclear;
- verification.status: how the factual metadata was source-checked;
- ratings.archive: Echo’s editorial judgment;
- community rating/review: listener response in SQLite, not static catalog truth.

The separation is architecturally strong, but the public UI has to translate multiple unknown/unclear/inactive states without confusing listeners.

### Creator/entity registry

catalog-src/entities.json contains 42 records with:

- stable id;
- display name;
- type: person, production-company, studio, or network;
- aliases;
- publication state;
- boolean indexable;
- optional directory flag;
- website/description;
- reviewed date;
- source URLs.

The validator requires unique normalized names/aliases across entities, stable IDs, valid HTTP(S) websites without embedded credentials, source URLs and valid reviewed dates for public entities, and prohibits a draft entity from being indexable. Person entities may only be linked with the creator role.

Current type distribution:

- 28 production companies;
- 9 networks;
- 3 studios;
- 2 people.

Entity relationships are explicit show-side rows such as:

~~~text
show.entityLinks = [
  { entityId: "fool-and-scholar-productions", role: "production-company" },
  { entityId: "k-a-statz", role: "creator" },
  { entityId: "travis-vengroff", role: "creator" }
]
~~~

The current public graph has 187 relationship rows across 172 unique shows:

- 115 production-company links;
- 61 network links;
- 7 studio links;
- 4 creator links.

All 42 registry entities are connected to at least one show, but only entities with enough linked shows pass the indexability rule. The organization directory displays 40 records; the two people remain reachable as detail pages and show facts because directory:false.

### Reviews and rating models

There are three different content concepts:

1. Archive editorial review — inline or catalog-src/reviews/<show-id>.json, with archive take, spoiler-free review, thoughts, quote, and numeric breakdown.
2. Archive rating — static 1–10 judgment, currently meaningful on 27 shows.
3. Listener rating/review — operational SQLite records; listener reviews use a 1–5 star headline rating and optional detailed 1–10 categories. Publication is moderated.

This is a good semantic separation. The local DB has the tables for active rating submissions, rating events, published listener reviews, helpful votes, and abuse events, but no currently published listener review rows.

### Collections

A collection record includes:

- id, title, description;
- label;
- kind;
- intentTags;
- commitment;
- coverShowIds;
- resolved showIds;
- per-show showReasons;
- anchorShowId for similarity;
- featured, order, createdAt, updatedAt;
- optional descriptionProvenance;
- optional automation definition for rule or semantic collections.

Current collection kinds are curated, similarity, and rule-based. The schema also documents editorial and semantic modes, but no editorial kind appeared in the current runtime distribution. Rule definitions support bounded factual clauses; semantic definitions can call configured local AI and retain confidence/evidence operationally. Public output remains a resolved static membership snapshot.

### Episodes, seasons, RSS, and transcripts

There are no first-class public Episode, Season, or Transcript entities in the catalog schema. Shows carry:

- season and episode counts;
- average episode minutes and total hours;
- first/latest release dates;
- latest feed item metadata;
- RSS URL;
- transcript availability/languages.

RSS is central to import/source checking but not represented as a public episode browser. This supports a compact catalog and low operational complexity, but it limits episode-level search, transcript search, release cadence analytics, and “start at the best episode” features.

### Important concepts that are not first-class entities

- Genres, tones, formats, tags, themes, best-for labels, and content notes are arrays of strings; the approved tag taxonomy is documented, but these are not separate database entities with descriptions or graph edges.
- Publishers, distributors, platforms, and sponsors are not first-class registry types. They appear in links, credits, legacy network values, or metadata.
- Seasons and episodes are aggregate counts/length data, not records with IDs, titles, dates, guests/cast, or links.
- Transcripts are availability/language metadata, not transcript or episode documents.
- Listener reviews are operational records keyed to a show, not authored catalog entities in data/shows.json.
- Collection membership is an array/snapshot in public data and an operational evidence/override model in SQLite, not a public edge entity with its own stable row.

This keeps the v1 catalog compact, but it is the boundary for future episode-level, platform-level, transcript-level, and richly typed credit features.

### Provenance model

At show level, provenance is represented through:

- officialDescription.sourceLabel, sourceUrl, verifiedAt;
- verification.status, verifiedAt, source, note;
- metadata.objectiveSources;
- importer metadata.import;
- metadata.sourceCategories, sourceKeywords, researchGaps;
- source/last-feed notes and runtime gaps.

At operational level, SQLite stores source snapshots, source type/key/URL, normalized payloads, field-level evidence, confidence, method, selection status, observed time, import runs, candidate revisions, and audit events. Creator/entity records have reviewed dates and required source URLs.

### Relationship graph and future capability

At present, the model can support without a wholesale replacement:

- show-to-show similarity scoring using shared fields plus explicit reasoned edges;
- “why this matches” explanations from similarReasons, shared collections, shared entities, genres, tones, format, status, runtime, and bestFor;
- multi-show creator/organization pages from explicit entityLinks;
- studio/network/production collaboration graphs once more links are migrated;
- hidden-gem filtering using coverage, ratings, review state, provenance, and catalog age;
- mood/tone filtering where metadata exists;
- user taste profiles as a separate layer over existing stable show IDs and feature fields.

It cannot currently support well:

- episode-level recommendations;
- reliable creator-wide coverage from raw legacy IDs alone;
- robust collaborative filtering because community data is sparse and anonymous;
- consistent similarity for all shows because 653 have no outgoing edges;
- high-confidence currently-active recommendations for 490 release-unknown records;
- a comprehensive transcript search product;
- creator ownership/control semantics beyond moderated verification requests.

## 5. Catalogue statistics

All counts in this section were recalculated from current generated/source data rather than copied blindly from documentation.

### Headline counts

| Measure | Exact current count |
|---|---:|
| Published shows | 724 |
| Draft shows | 0 |
| Source show record files | 724, excluding _order.json |
| Collections | 46 |
| Featured collections | 6 |
| Registry entities | 42 |
| Visible organization directory cards | 40 |
| Raw flattened creator assignments | 751 |
| Unique raw creator display strings | 645 |
| Shows with legacy creatorId | 710 |
| Unique legacy creatorId values | 604 |
| Shows with networkId | 357 |
| Unique networkId values | 224 |
| Explicit entity relationship rows | 187 |
| Shows with explicit entity links | 172 |
| Full-review shows | 7 |
| Archive-rated shows | 27 |
| Review companion records | 7 |
| Indexed-only shows | 200 |
| Imported shows | 517 |
| Planned shows | 0 |
| Spotlight shows | 0 |
| Explicit directed similar-show edges | 234 |
| Shows with outgoing similar-show data | 71 |
| Similarity collections | 17 |
| Public collection membership rows | 620 |
| Shows covered by at least one public collection | 243 |
| Shows in no public collection | 481 |
| Source records with objective-source data | 724 |
| Records with importer metadata | 656 |
| Documented research-gap shows | 17 |
| RSS links | 721 |
| Missing RSS links | 3 |
| Local covers present | 724 of 724 |
| Generated cover variants present | 1,294 of 1,294 |

### Metadata completeness

Counts are meaningful non-empty values across 724 published records. Percentages are of the published catalog.

| Field | Present | Percent |
|---|---:|---:|
| Subtitle | 280 | 38.67% |
| Tones | 73 | 10.08% |
| Formats | 721 | 99.59% |
| Discovery tags | 207 | 28.59% |
| Aliases | 688 | 95.03% |
| Themes | 82 | 11.33% |
| Content notes | 75 | 10.36% |
| Transcript languages | 43 | 5.94% |
| bestFor | 71 | 9.81% |
| similarTo | 71 | 9.81% |
| Archive take | 70 | 9.67% |
| Spoiler-free review | 7 | 0.97% |
| Thoughts | 7 | 0.97% |
| Spotify link | 227 | 31.35% |
| Apple Podcasts link | 702 | 96.96% |
| Listen/official website field | 680/681 | 93.92%/94.06% |
| RSS link | 721 | 99.59% |
| Season count | 599 | 82.74% |
| Episode count | 717 | 99.03% |
| Average episode minutes | 720 | 99.45% |
| Total-hours runtime | 42 | 5.80% |
| Archive numeric rating | 27 | 3.73% |
| Patreon | 131 | 18.09% |
| Discord | 36 | 4.97% |
| YouTube | 165 | 22.79% |

The website counts above are presence counts of structured website fields, not a claim that every URL is a canonical official site. A separate local scan found 42 records with neither listenLinks.website nor officialLinks.website. URL syntax was valid locally, but URL reachability was not tested.

### Review and verification distributions

reviewStatus:

| Status | Count |
|---|---:|
| imported | 517 |
| indexed-only | 200 |
| full-review | 7 |

verification.status:

| Status | Count |
|---|---:|
| automated-source-checked | 518 |
| maintainer-source-reviewed | 79 |
| partially-source-reviewed | 59 |
| source-verified | 50 |
| partially-source-verified | 9 |
| source-verified-with-feed-note | 5 |
| source-verified-with-future-status-note | 1 |
| source-verified-with-upcoming-note | 1 |
| partially-source-verified-with-feed-note | 1 |
| source-verified-with-title-normalization | 1 |

Every current record has a verification object/date/source in generated data, but the status vocabulary signals materially different levels of review.

### Lifecycle distributions

releaseStatus:

| Status | Count |
|---|---:|
| unknown | 490 |
| active | 186 |
| completed | 31 |
| inactive | 10 |
| hiatus | 7 |

completionStatus:

| Status | Count |
|---|---:|
| unclear | 498 |
| ongoing | 192 |
| finished | 32 |
| cancelled | 2 |

Observed pairs:

| Release/completion pair | Count |
|---|---:|
| unknown / unclear | 490 |
| active / ongoing | 186 |
| completed / finished | 31 |
| hiatus / ongoing | 5 |
| hiatus / unclear | 2 |
| inactive / unclear | 6 |
| inactive / cancelled | 2 |
| inactive / finished | 1 |
| inactive / ongoing | 1 |

The inactive/ongoing pair is the clearest contradictory-looking pair; it is impact-winter and is accompanied by a future-status research gap. Lifecycle fields are present, but unknown/unclear is dominant. This is honest data, yet it weakens status-based discovery and makes the archive’s use of ongoing, completed, and inactive require careful UI explanation.

### Genre, tone, format, and context distributions

Genres:

| Genre | Shows |
|---|---:|
| drama | 671 |
| sci-fi | 280 |
| comedy | 182 |
| horror | 59 |
| mystery | 54 |
| thriller | 48 |
| fantasy | 22 |
| adventure | 15 |
| supernatural | 9 |

Tone:

| Tone | Shows |
|---|---:|
| tense | 38 |
| dark | 35 |
| cinematic | 31 |
| weird | 30 |
| funny | 20 |
| warm | 15 |
| hopeful | 15 |
| chaotic | 8 |
| bleak | 7 |
| melancholic | 3 |

The current data uses 12 distinct format values, but casing variants produce duplicate visible filter options. The normalized concepts are serialized, episodic, full-cast, narrated, anthology, limited-series, and long-running/long-running-like values. Exact observed labels include serialized/Serialized, episodic/Episodic, full-cast/Full cast, narrated/Narrated, anthology/Anthology, limited-series, and Long running.

bestFor values:

| Context | Shows |
|---|---:|
| late-night | 33 |
| easy-entry | 21 |
| binge-listening | 21 |
| headphones-on | 21 |
| serious-sci-fi | 14 |
| worldbuilding | 14 |
| cold-isolation-horror | 10 |
| long-walks | 8 |
| funny-space-disasters | 7 |
| short-under-five-hours | 4 |
| warm-weird | 4 |

### Collection statistics

| Measure | Count |
|---|---:|
| Total collections | 46 |
| Curated | 20 |
| Similarity | 17 |
| Rule-based | 9 |
| Generated descriptions | 9 |
| Unspecified/manual-looking description provenance | 37 |
| Featured | 6 |
| Total public membership rows | 620 |
| Minimum collection size | 5 |
| Maximum collection size | 72 |
| Mean collection size | 13.48 |
| Median collection size | 9 |
| Unique covered shows | 243 |
| Mean memberships per show | 0.856 |
| Median memberships per show | 0 |

Largest collections:

| Collection | Members |
|---|---:|
| ongoing-sci-fi | 72 |
| episodic-comedy | 70 |
| ongoing-comedy | 48 |
| ongoing-horror | 25 |
| late-night-tension | 20 |
| finished-arcs | 20 |
| completed-drama | 20 |
| serious-sci-fi | 17 |
| completed-sci-fi | 17 |
| worldbuilding | 16 |

Manual/non-rule collections cover 97 unique shows; rule-based public collections cover 217 unique shows. Those sets overlap. Only 13.40% of the catalog is touched by at least one non-rule collection, showing that the curated-discovery layer is materially narrower than the 46-route count implies.

### Creator and relationship statistics

The 751 flattened creator assignments average 1.04 per show. The raw creator strings are not equivalent to 645 reviewed entities. The new registry has 42 typed records and 187 explicit relationship rows. Only 172 shows have any explicit relationship, so 552 records still require legacy/fallback creator facts for presentation.

Creator-array distribution is narrow:

| Raw creator assignments on a show | Shows |
|---:|---:|
| 1 | 701 |
| 2 | 19 |
| 3 | 4 |

Explicit entity-link distribution is:

| Typed entity links on a show | Shows |
|---:|---:|
| 0 | 552 |
| 1 | 159 |
| 2 | 11 |
| 3 | 2 |

Top explicit registry-linked organization/show counts include:

- Realm: 21
- Bloody FM: 17
- iHeartPodcasts: 13
- QCODE: 10
- Rusty Quill: 8
- 7 Lamb: 6
- Atypical Artists: 6
- Gimlet: 6
- Faustian Nonsense: 6
- GZM Shows: 6

Top similar-show incoming anchors include Midnight Burger (15), The White Vault (13), Archive 81 (12), Oz 9 (10), Desert Skies (9), Ars Paradoxica (9), Malevolent (8), EOS 10 (8), Wooden Overcoats (8), and Vast Horizon (7). These are network hubs, not necessarily algorithmic popularity rankings.

## 6. Data quality audit

The data-quality scan was non-mutating. It checked IDs, titles, normalized duplicates, structured URLs, dates, lifecycle combinations, vocabulary variants, relationship references, asset existence, collection coverage, provenance, and sparse fields.

### Confirmed clean or strongly controlled areas

- No duplicate show IDs in runtime data.
- No duplicate normalized show titles were found.
- Source record count and runtime record count match: 724 each, excluding _order.json.
- No source/runtime ID drift was found.
- All 724 local cover references resolved.
- All 1,294 generated cover variant rows/files resolved.
- No external cover references were present in the current runtime snapshot.
- No invalid structured URL syntax was found across approximately 10,376 inspected URL values; this does not prove remote reachability.
- No invalid explicit entity links were found.
- No duplicate similarTo edge, self-edge, unknown target, or missing reason was found in the current scan.
- No record had a description shorter than the 40-character publication minimum.
- No record had releaseDates.first later than releaseDates.latest.
- Entity registry normalized names/aliases passed local validator expectations.

### Confirmed anomalies and inconsistencies

#### 1. Lifecycle contradiction: impact-winter

The record has:

~~~text
releaseStatus: "inactive"
completionStatus: "ongoing"
latest release: 2024-07-18
research gap: "future season status beyond Season 3"
~~~

This may represent an intentionally cautious “not currently active, future continuation unknown” state, but a listener sees contradictory lifecycle semantics unless the UI explains the distinction.

#### 2. Format casing duplicates

Five normalized format concepts appear in multiple casing/spelling forms:

- full-cast and Full cast;
- serialized and Serialized;
- anthology and Anthology;
- narrated and Narrated;
- episodic and Episodic.

The browser rendered duplicate-looking filter labels with the same apparent meaning. This is a direct user-facing data-quality issue, not merely an internal style difference.

#### 3. Theme casing collisions

Six normalized theme concepts have case variants, including mystery, horror, vampires, identity, conspiracy, and friendship. These may not all be exposed as filters today, but they create inconsistent tokens and future ranking risk.

#### 4. Creator/network string variant

The raw creator field contains a punctuation variant between Rusty Quill Ltd. and Rusty Quill Ltd. This is a small example of why raw display strings cannot serve as a reliable entity key.

#### 5. Duplicate alias in at least one show

The current scan found a record containing both We're Alive and We’re Alive as aliases. They differ only by apostrophe style and can produce duplicate search/index terms.

#### 6. Legacy identifier mismatch with the new entity registry

604 unique legacy creatorId values and 224 unique networkId values coexist with a 42-record first-class entity registry. The majority of legacy IDs do not correspond to current registry IDs. This is expected during migration, but any code that treats creatorId as a reliable foreign key would be wrong.

#### 7. Missing official website fields

42 records have neither listenLinks.website nor officialLinks.website. They may still have Apple/RSS or platform links; this is specifically a missing official-site field, not a claim that they lack any way to listen.

#### 8. Missing RSS

Three records lack RSS:

- earth-eclipsed;
- the-rapscallion-agency;
- the-invenios-expeditions.

The generated status report says the same. Because RSS is the primary objective metadata source in the importer strategy, these records are weaker for future refresh automation.

#### 9. Runtime/research gaps

Four runtime gaps are called out in generated status data:

- the-rapscallion-agency;
- the-invenios-expeditions;
- edict-zero-fis;
- machina.

The documented research-gap list has 17 records, including future status, feed semantics, season status, runtime, awards, cast, and identification issues. These are not necessarily errors; they are explicit unknowns. They are important because the current UI exposes a large catalog while the data-quality status can remain unresolved.

#### 10. Sparse public relationships

The biggest quality issue is not invalid data but absent data:

- 481 shows have zero collection memberships;
- 653 have no outgoing similarity links;
- 651 have no tone data;
- 653 have no bestFor;
- 517 have no tags;
- 580 have unknown transcript availability/language state;
- 552 have no explicit entity link;
- 490 have unknown release status;
- 498 have unclear completion status.

This means many records are valid catalog entries but weak discovery objects.

### Duplicate/split/conflation findings

No duplicate show-title group or duplicate entity-normalized-name group was found in the current authored registry. That does not mean creator identity is solved:

- raw creator strings include people, companies, studios, networks, platforms, distributors, usernames, and compound credits;
- old network/networkId values are not semantically safe as organization entities;
- entity links are curated only for a 172-show subset;
- legacy fallback presentation can show creator information without establishing a graph relationship.

The highest-risk class is therefore semantic conflation, not exact duplicate records.

### Broken/malformed links

The local validator accepted the structured URL syntax inspected, including HTTP/HTTPS restrictions and some platform-specific validation. There is no local proof of:

- HTTP status;
- redirect quality;
- feed validity;
- Apple/Spotify page existence;
- canonical URL match;
- site ownership;
- regional availability;
- whether a website is an official site rather than a platform/profile link.

The importer documentation says Apple lookup, RSS, Podcast Index, and official structured data are used differently, but URL presence should not be interpreted as current availability.

### Contradictory collection risks

The public collection model allows manual, similarity, and rule-based routes. The current data includes lifecycle collections such as ongoing/completed and purpose routes. Local validation checks collection references, duplication, similarity anchors, and reasons, but does not prove semantic appropriateness of every member.

The largest collections are ongoing-sci-fi (72), episodic-comedy (70), and ongoing-comedy (48). They may be useful structural routes, but their size and rule-based nature mean they should not automatically be read as editorial endorsement. The archive’s own model distinguishes rule-match evidence from manual/editorial membership for this reason.

### Placeholder/default exposure

The importer restrictions are strong: imported records cannot carry archive-owned review/rating/thoughts/quote/bestFor/similarity/featured/popularity fields. However, current runtime objects include empty structural objects and explicit unknown values. The UI generally suppresses unknown rows, but a strategist should treat “data exists” and “usable discovery data exists” as different metrics.

## 7. Creator system audit

### What the new creator system is

The creator system is a typed, source-reviewed entity registry, not a simple projection of the legacy creatorId field. It is authored in catalog-src/entities.json, generated to data/entities.json, joined to shows through explicit entityLinks, rendered by backend/lib/entity-page-render.js, and enhanced client-side by shared/app/pages/entity-directory.js.

The registry currently contains:

- 28 production companies;
- 9 networks;
- 3 studios;
- 2 people;
- 42 total public/indexable records.

Directory visibility intentionally differs from page visibility:

- 40 organization records appear in /creators;
- K.A. Statz and Travis Vengroff have directory:false;
- both people remain reachable on direct detail routes and show facts.

This is a sensible safety rule because a public organization directory should not automatically turn every individual credit into a directory card.

### Identity and role model

Entity types:

- person
- production-company
- studio
- network

Entity roles:

- creator
- production-company
- studio
- network

The validator enforces that a person is linked only as creator, that every link resolves to a registry ID, and that each show cannot duplicate the same entity/role pair.

The current role priority for More from and display selection is production company, then studio, then creator, then network. This is a product choice: production ownership/brand is preferred over a broad network label when both are available.

### Field and source requirements

Public entity records require:

- stable slug-like ID;
- unique name and normalized aliases;
- type/publication/indexable;
- source URLs;
- reviewed date;
- optional valid website/description;
- relationship to published shows for public/indexable output.

The entity page exposes a Source-backed connection trust label and a correction route. It does not imply creator approval of Echo ratings/reviews, consistent with the documented trust boundary.

### How shows link to creators

There are three distinct levels:

1. Explicit relationship: entityLinks joins to a registry ID and role. This powers entity pages, connected-show counts, detail lists, and More from.
2. Legacy identifiers: creatorId and networkId remain on many records but do not automatically resolve to entity pages.
3. Display fallbacks: creators, credits.creatorName, and other credits render facts/search text even when there is no explicit relationship.

Current coverage:

- 187 explicit relationship rows;
- 172 shows with one or more explicit links;
- 552 records still rely on fallback creator presentation for any creator-style graph effect;
- 751 flattened raw creator assignments;
- 645 unique raw creator strings;
- 710 shows with a creatorId, but only 604 unique values and most are not first-class entity IDs.

### Fool & Scholar

The current registry record is:

- ID: fool-and-scholar-productions;
- name: Fool & Scholar Productions;
- type: production company;
- public and indexable;
- source-backed/reviewed;
- official website and source URLs;
- aliases/source metadata in the registry.

The local rendered detail page showed four connected shows:

- Don’t Mind;
- The Liberty Podcast;
- The White Vault;
- Vast Horizon.

The organization directory search for Fool & Scholar returned one result and four shows. The White Vault source record additionally contains explicit K.A. Statz and Travis Vengroff creator links. Don’t Mind and the other connected records demonstrate that the organization page is powered by explicit typed relationships, not just a string search.

### K.A. Statz

The current registry record is:

- ID: k-a-statz;
- name: K.A. Statz;
- type: person;
- alias: KA Statz;
- public/indexable detail record;
- directory:false;
- reviewed/source URLs.

The rendered page is reachable directly and from show facts but does not appear in the organization directory. It has two direct linked shows in the current graph: The White Vault and Vast Horizon. The page treatment correctly distinguishes an individual creator from an organization.

### Travis Vengroff

The current registry record is:

- ID: travis-vengroff;
- name: Travis Vengroff;
- type: person;
- public/indexable detail record;
- directory:false;
- source URLs/review metadata.

The rendered page is similarly direct/detail-only and has two linked shows in the current graph: The White Vault and Vast Horizon. The record is not collapsed into Fool & Scholar, and show link roles preserve the distinction between creator and production company.

### Search, navigation, and More from

Entity search:

- searches entity name and aliases;
- requires every query token to occur in normalized name/alias;
- does not use edit distance/fuzzy matching;
- returns organization cards in the directory;
- updates query/filter/sort state through history.replaceState.

Entity pages:

- are linked from explicit show facts;
- list connected shows alphabetically;
- show related collections where available;
- include an official website if present;
- include correction links with submissionType=correction, correctionType=creator-page, and entity context.

More from:

- only selects entities with at least three other connected shows;
- respects role priority;
- uses explicit relationships;
- displays up to four show cards.

The rendered Derelict page had no More from entity section because no qualifying explicit organization/creator relationship was available. This is a good example of the system refusing to infer a graph edge from a raw credit.

### Is it genuinely relational?

Yes, for the curated subset. It has:

- a normalized registry;
- stable foreign-key-like IDs;
- role constraints;
- source/review gates;
- explicit many-to-many show/entity links;
- entity-to-show list pages;
- graph-aware collection and More from behavior.

It is not yet a complete relational model for the whole catalog. Most legacy creator/network data remains display metadata, and the raw values are not trustworthy enough to migrate automatically. The public entity system is therefore a quality-gated pilot rather than a comprehensive creator graph.

### Future capability without major schema changes

The existing model can support, with additional curated rows and UI/ranking logic:

- creator pages for reviewed people and organizations;
- production-company/network/studio collaboration routes;
- people who made this also made that;
- creator-specific collections;
- creator verification badges limited to factual metadata;
- source-backed contributor profiles;
- creator acquisition links and official outbound funnels;
- graph-based discovery and explanations.

The main missing prerequisite is coverage and identity resolution, not a fundamentally missing relationship primitive.

## 8. Recommendation and discovery system

### Current mechanisms

| Mechanism | Selection type | Signals | Ranking/explanation |
|---|---|---|---|
| Homepage start-here cards | Manual/static IDs | Known favorite/status route | Copy/route itself explains intent |
| Search | Rule-based scored client search | Token fields, aliases, full text, similarity titles | Exact/partial/prefix/fuzzy score; no why-this-matches card explanation |
| Filters | Deterministic inclusion | Genre, format, tone, best-for, status, tags | No weighted ranking beyond query score |
| Featured collections | Manual featured/order | Collection editorial metadata | Editorial ordering |
| Curated collections | Manual membership | Show IDs, intent tags, description | Optional show reasons |
| Similarity collections | Manual anchor/membership | Anchor show, show IDs, reasons | Route title/description and reasons |
| Rule-based collections | Deterministic metadata clauses | Completion, genre, status, formats, etc. | Membership from rules; operational candidate evidence |
| Semantic collections | Scaffolding/operational | Semantic query/local AI | Confidence/evidence model exists; no public semantic kind in current distribution |
| Show similarTo | Manual/direct | Explicit target IDs | 234 directed edges; per-target reasons |
| Show Try next | Deterministic renderer | Similarity edges/reasons | Up to 3 cards, reason text when available |
| Related collections | Membership lookup | Show collection membership | Up to 3 visible plus overflow details |
| More from | Relationship rule | Explicit entity links, role priority, at least 3 other shows | Up to 4 cards; no inferred raw creator links |
| Popular | Hybrid fallback | Live community summaries, static popularity score, fallback IDs | Current static popularity score count is 0; local live summaries empty |
| Recently added | Deterministic | createdAt, updatedAt | Four cards, no popularity weighting |
| Archive reviews/ratings | Manual/editorial | Review fields, archive rating | Decision-support content, not a recommender |
| Archivist | Optional AI/chat | Archive context/search/catalog | Disabled by default; no proof of live use |

### Current ranking behavior

Search has a real score model, but the catalog does not have a unified recommendation rank. Collection order is editorial/order-field based; show similarity is authored; popular is fallback-driven without meaningful static popularity scores; recent is date-driven.

There is no evidence of:

- collaborative filtering;
- matrix factorization;
- user-history ranking;
- embedding/vector search;
- click-through learning;
- popularity normalization by catalog age;
- confidence-weighted graph ranking;
- a single cross-surface relevance function.

### Available recommendation signals

The current repository already has the following candidate signals.

Content/semantic:

- shared genre;
- shared tone;
- shared format;
- shared tag;
- shared theme;
- shared content note;
- shared bestFor context;
- shared language;
- shared narrator/structure/POV;
- shared source material;
- shared intensity;
- similar title/alias terms;
- description/full-text overlap;
- transcript availability;
- runtime/commitment;
- episode/season count;
- release/completion status.

Editorial and trust:

- explicit similarTo;
- similarReasons;
- shared collection membership;
- collection type: curated, similarity, rule-based;
- collection anchor;
- collection reason;
- archive rating and six component ratings;
- full-review/indexed-only/imported state;
- featured flag;
- archive take/review;
- creator/entity role;
- source verification status;
- verified date;
- objective source count/quality;
- research gaps;
- freshness/update date.

External/operational:

- Apple, Spotify, RSS, website, Patreon, Discord, YouTube availability;
- source platform and imported provenance;
- latest feed item;
- importer candidate confidence;
- rule/semantic match confidence;
- manual collection overrides;
- community rating count/average once public threshold is met;
- listener-review helpful votes and context.

### Directionality and explanation

similarTo is directional in storage even where reciprocal pairs exist. There are 44 reciprocal pairs and 234 total directed edges. showReasons and similarReasons are the only explicit why fields. Shared metadata can explain a future recommendation, but the current UI does not generate a normalized explanation from shared signals.

The collection system is stronger on explainability than the show similarity system because collection membership can have a per-show reason and a named user intent. The typed entity system can explain More from through a relationship role, but not yet why one creator connection is strategically relevant.

### Constraints

- 653 shows have no outbound similarTo, so similarity search has a long tail of no explicit edges.
- 481 shows are in no public collection.
- 651 have no tone and 653 no bestFor, limiting mood/use-case matching.
- static popularity scores are empty, making current popularity mostly fallback/live-data dependent.
- community records are too sparse locally to infer ranking.
- creator graph coverage is too low for creator-based recommendations across the whole catalog.
- current search returns cards, not a recommendation explanation or confidence state.

## 9. Collections system

### Current collection types and concepts

The runtime uses:

- curated: 20; authored discovery paths, including mood, situation, genre, completion, and editorial routes;
- similarity: 17; anchored routes such as Shows like Midnight Burger and analogous known-show pathways;
- rule-based: 9; factual membership generated or maintained from bounded metadata criteria.

The schema also documents editorial and semantic modes. No editorial collection kind appeared in the current count, and semantic collections are a supported design/operational path rather than a public current category.

### Actual conceptual coverage

Observed collection purposes include:

- listening situation: long walks, late night, headphones on;
- onboarding/commitment: easy first steps, short/under-five-hours, binge listening;
- mood/tone: cold isolation horror, warm weird, tension;
- genre: serious sci-fi and genre/status combinations;
- lifecycle: finished arcs, completed drama, ongoing sci-fi/comedy/horror;
- format: episodic comedy;
- similarity: shows-like-known-show routes;
- worldbuilding and other editorial intent.

This is meaningfully more useful than a genre folder because it answers when/why a listener would choose a route. The collection count should not be interpreted as 46 equally editorially rich routes: 9 use generated descriptions and 9 are rule-based; 37 have unspecified/manual-looking description provenance.

### Membership and ranking

Public collection membership is a resolved showIds snapshot. order and featured affect directory presentation. On a collection page, member order is based on authored collection data and renderer rules; there is no generalized user-personalized collection ranking.

Public membership distribution:

- min size: 5;
- max size: 72;
- mean: 13.48;
- median: 9;
- 620 total rows;
- 243 unique covered shows;
- 481 uncovered shows.

The largest collections may behave partly like structured filters:

- ongoing-sci-fi (72);
- episodic-comedy (70);
- ongoing-comedy (48);
- ongoing-horror (25).

The smaller similarity/intent routes have stronger editorial potential because the purpose is narrower and the anchor is clearer.

### Overlap and redundancy

The data supports overlap by design. A show may belong to multiple routes, but current coverage is shallow for most:

| Membership count per show | Shows |
|---:|---:|
| 0 | 481 |
| 1 | 128 |
| 2 | 31 |
| 3 | 22 |
| 4 | 15 |
| 5 | 20 |
| 6 | 13 |
| 7 | 3 |
| 8 | 3 |
| 9 | 5 |
| 10 | 1 |
| 12 | 1 |
| 14 | 1 |

The 609 records with fewer than two memberships demonstrate that collections do not yet form a broad navigation web. Some collections behave like high-level factual facets, while a smaller subset provides genuinely editorial discovery.

### Rule-based operational layer

SQLite contains collection candidates, collection runs, membership evidence, overrides, and events. The current local artifact reports:

- 26 rule-based collection candidates;
- 14 approved and 12 proposed;
- 557 rule-match membership/evidence rows;
- 15 collections represented in operational membership evidence;
- 358 distinct shows in those evidence rows;
- 16 completed membership-recalculation runs;
- no membership overrides.

The 557 operational rows and 620 public membership rows are different surfaces and should not be merged in analysis. The public data is the current published snapshot; SQLite records workflow evidence/candidates and may include state not currently public.

### SEO behavior

Collection detail SEO is gated by:

- non-empty title;
- description of at least 60 characters;
- at least 4 resolved published shows;
- every resolved show reason at least 20 characters for indexable routes.

This protects the sitemap from thin collection pages. In the current snapshot 40 of 46 collection routes are in the sitemap; six are intentionally not indexable under the local gate.

## 10. Search and filtering

### Implementation

Search is implemented in shared/archive-search.js and hydrated by shared/app/data.js. The browser loads the 1.69 MB search index and the 14.97 MB shows JSON in the current uncompressed local output model. Search is therefore client-side and catalog-wide.

Normalization:

- lowercase;
- Unicode normalization;
- ampersand-to-and treatment;
- separator/punctuation normalization;
- token filtering;
- known alias expansion.

Index fields:

- title, subtitle, aliases;
- tags, genres, tones, formats, best-for, themes, content notes;
- creators, cast, languages, transcript languages;
- narrator, transcript availability;
- content/facts/credits;
- completion/review state;
- similar titles;
- full text/descriptions.

Scoring supports exact, partial, prefix, and bounded fuzzy token matches. Fuzzy matching is intentionally limited: longer tokens may tolerate up to two edits, shorter tokens up to one, and the first character must align. This is useful typo tolerance but not semantic search.

### Similarity query parsing

Recognized patterns include:

- shows like X;
- like X;
- similar to X;
- what is X similar to;
- title-like X like patterns.

The parser resolves the longest exact/contains title seed and uses similar-title fields. It does not currently produce a dedicated route or explanatory comparison panel; it filters/ranks show cards.

### Representative local searches

These were run against the local rendered application:

| Query/action | Observed result |
|---|---|
| Quick Sci-Fi filter | URL became /?tags=sci-fi; 39 results and 2 full reviews in the active result set. The quick action is tag-based, not necessarily the genre filter. |
| Derelict | 8 results; derelict first, followed by earth-eclipsed, solar, spectre, Copperheart, Marsfall, The Program, and The Callisto Protocol: Helix Station. |
| welcom night vale | 8 results; Welcome to Night Vale first, followed by Harbor, King Falls AM, Desert Skies, The Amelia Project, Victoriocity, Kakos Industries, and Polybius Protocol. This demonstrates useful bounded typo tolerance. |
| sci fi | 280 matching shows; first page renders 60. Alias expansion works. |
| transcripts | 54 matches, driven by transcript-related indexed metadata. |
| xyzzy | 0 results; the UI showed a helpful no-results state with clear/browse collections/submit/correct actions. |

The typo search is a strong local UX behavior. Ranking quality at scale remains constrained by sparse fields, no learned click feedback, and a single client-side index.

### Filtering semantics

Filters combine:

- OR inside the same group;
- AND across groups;
- query score within the surviving set.

This is understandable but can become restrictive when two sparse groups are combined. Because tones, bestFor, and tags are absent from most records, many combinations can produce empty or misleadingly narrow results.

### URL/query-state contract

The homepage reads and writes:

- q for the search query;
- collection for a selected collection;
- sort, currently default or recently-updated;
- repeated genre parameters;
- repeated group parameters for tones, formats, tags, bestFor, completionStatus, and reviewStatus.

The collections directory reads and writes intent, q, and sort. Its sort values are editorial, newest, title, shows, rating, and popularity; a legacy updated value is normalized to newest. The entity directory reads and writes q, type, and sort, with type values all, production-company, studio, and network, and sort values name and shows. These states use history.replaceState and are intentionally not separate indexable pages.

### Visible vocabulary issue

The format filter currently shows duplicate-looking options due to casing variants. The system’s validator/documentation intends canonical taxonomy, but the current rendered result proves source/runtime normalization is incomplete or a pre-existing dirty output is not in sync with the intended taxonomy.

### Performance implications

For 724 shows, client-side search is practical. The main costs are:

- loading the full shows JSON, about 14.3 MiB uncompressed;
- loading the search index, about 1.61 MiB;
- indexing/hydrating/searching in the browser;
- rendering 60-card result batches and high-image-card pages;
- repeated data fetches across page modules if cache behavior is not warm.

At thousands or tens of thousands of records, the current client-side model becomes a payload and memory problem before the matching algorithm itself becomes unusable. This is discussed in detail in the scaling section.

## 11. UX and design-system audit

### Visual identity

The rendered application preserves the intended Echo identity:

- black/charcoal background;
- red/orange archive accents;
- restrained green community accents;
- thin borders and rounded cards;
- compact metadata;
- cover-art-led cards;
- radio telescope, signal, archive, and cinematic imagery;
- small uppercase labels paired with readable body copy.

The visual language is noticeably different from a generic SaaS dashboard or a bright podcast app. The homepage’s telescope hero is atmospheric but remains bounded; the browse grid and collection sections quickly bring the user to content.

Relevant sources are site-src/partials/head.html, shared/styles/base/variables.css, shared/styles/base/global/*.css, shared/styles/home/*.css, shared/styles/show/*.css, and shared/styles/home/creators/*.css. The page head declares a dark color scheme and the CSS contains route-specific responsive and reduced-motion rules.

There is no visual theme switch. The word “theme” in the catalog is a content descriptor, not a user-selectable color theme. The application is effectively dark-only.

### Desktop observation

At a 1462 by 709 browser viewport, the homepage showed:

- compact top navigation;
- a hero approximately 430 pixels tall below the header;
- radio telescope/signal art and the central discovery promise;
- three start-here cards;
- search/filter controls;
- archive statistics;
- an initial browse grid of 60 cards;
- 7 quick filter actions;
- 4 popular cards;
- 4 recent cards;
- 18 visible featured-collection carousel cards and 18 visible similarity-collection carousel cards, including carousel clones;
- a long but coherent document rather than a single oversized hero.

The initial result grid and compact cards follow the repository’s stated density rule. The homepage is content-first after the hero.

### Mobile observation

At 390 by 844:

- the header collapses to a logo/menu treatment;
- a four-item navigation strip exposes Browse, Collections, Creators, and Submit;
- the hero still fits without horizontal page overflow;
- start-here cards become horizontally arranged;
- search and filter controls remain usable but the search placeholder is visually truncated;
- filter chips are horizontally scrollable;
- archive stats move to a two-column presentation;
- the main content begins at roughly 10 pixels from the viewport edge with a 370-pixel content width;
- body scroll width matched document width at 390 pixels.

The closed mobile drawer sits off-canvas intentionally. When opened, it becomes a full-height dark overlay with an approximately 366-pixel drawer and the page background is scroll locked.

### Navigation accessibility behavior

The mobile-nav module implements more than visual toggling:

- aria-expanded on the menu toggle;
- aria-controls linking the toggle to the shell;
- aria-hidden management for the drawer;
- focus moved into the drawer when opened;
- focus restored to the toggle on close;
- Escape closes the drawer;
- Tab and Shift+Tab wrap within drawer focusables;
- background body/document scroll is locked and restored;
- links close the drawer on navigation;
- media-query changes close/reset the drawer.

The local browser pass confirmed aria-expanded=true, aria-hidden=false, body overflow lock, and a finite drawer focusable set when open. A full screen-reader audit, axe scan, and keyboard audit across every page were not performed.

### Information hierarchy

The main hierarchy is strong:

1. Find/search or start from a known show.
2. Filter by practical listening intent.
3. Scan compact cards.
4. Open a show for a decision.
5. Continue through collections, similar shows, or entities.

Show pages are materially denser than cards but still sectioned into best-for, description/review, facts/links, community, next shows, and collections. Imported records use a visibly more factual/disclosure-oriented treatment, which avoids pretending that all catalog records have equal editorial depth.

### Consistency findings

Strong consistency:

- card treatments and cover-art language;
- thin border/rounded-card system;
- archive/community distinction;
- collection and show route vocabulary;
- dark-only palette;
- mobile navigation behavior;
- share control fallback behavior;
- responsive image variants;
- reduced-motion media rules in major animation surfaces.

Visible or structural inconsistencies:

- duplicate format filter options from casing variants;
- page metadata coverage is not uniform in legacy generated artifacts;
- some route CSS bundles and older base CSS retain historical styles alongside newer design-specific styles;
- show pages vary substantially in density based on imported versus full-review state;
- source-backed connection, creator verified, indexed-only, and imported are not interchangeable but can appear adjacent to listeners with different levels of explanatory detail;
- all-dark presentation means users needing a light visual mode have no alternative.

These are audit findings, not redesign recommendations.

### Empty, loading, and error states

The homepage has:

- a loading-state path when prerendered content is not available;
- disabled browse controls while initial data loads;
- a no-results card;
- a clear-filters action;
- a browse-collections action;
- a submit/correct action;
- an Archivist action only when Archivist is enabled.

Data fetches use a timeout, and page-level errors route to an error surface rather than silently leaving a blank grid. Show/collection/entity missing routes have 404 handling in the backend. The local visual pass did not simulate network failure, API timeout, or malformed JSON in the browser.

### Cards, buttons, and affordances

Cards keep text short and use artwork to establish recognition. Show actions distinguish Start/platform links from archive/facts/share actions. Collection cards use visual route cues and anchor art. Entity cards use circular arrow affordances in the current dirty checkout.

The dense design has an intentional tradeoff: more content is visible at once, but small metadata and multiple pill/chip states require careful contrast and consistent vocabulary. The CSS includes explicit focus-visible outlines; no full contrast measurement was performed.

## 12. Homepage audit

### Section order and selection logic

The homepage’s source/runtime order is:

1. Site header/navigation.
2. Cinematic archive hero.
3. Three start-here/favorite routes.
4. Browse search and sticky search behavior.
5. Filter menu and quick filters.
6. Archive statistics.
7. Browse results/archive grid.
8. Most popular section.
9. Recently added section.
10. Featured collection rail.
11. Similarity/favorite-route rail.
12. Footer/support/legal.

The exact visual ordering can vary with sections being hidden when a query/filter/sort state is active, but this is the default information architecture.

### Start-here cards

The current three high-intent entry points observed locally are:

- Shows like Midnight Burger;
- Completed shows;
- Shows like Welcome to Night Vale.

These are manually chosen route IDs in the homepage constants rather than a dynamic user model. They send the user toward a known favorite or listening-state decision, which is an effective first-time-user orientation.

### Browse section

The browse section loads all published shows and prerenders card shells/results. It initially shows 60 cards. The load-more control can add another 60, and an auto-load path requires repeated downward-end attempts rather than immediately appending on one scroll event. The page can display active search/filter descriptors and synchronizes URL state.

### Quick filters and filter menu

Quick filters are derived from visible tags and currently include practical terms such as Sci-Fi, full-cast/format-related options, completed/ongoing, and listening contexts. The local Sci-Fi quick action generated /?tags=sci-fi, which is a tag filter. The structured filter menu separately exposes genres and formats. This distinction can produce different result counts for a user who assumes the quick chip and Story type option are identical.

### Archive statistics

The current source/runtime stats are:

- 724 shows;
- 46 collections;
- 7 full reviews;
- 645 raw credited-creator display strings when the broader credited-creator metric is shown by the creator system;
- 724 metadata-checked records under the generated stats definition.

The homepage and collections page use derived archive stats; the archived stats file stores the current snapshot. Statistics should be read with their labels, because creatorCount means raw credited creator strings, while the public creator directory means 40 typed organizations.

### Most popular

The most popular controller:

1. loads live community summaries for published show IDs;
2. ranks records with ratings by rating count, then average rating, then title;
3. fills remaining slots from finite static popularity scores;
4. fills remaining slots from four hardcoded fallback show IDs;
5. displays four cards.

Because the current static catalog has zero meaningful popularity scores and local community summaries are empty, the local default is fallback-driven. This is not a production popularity claim. If live ratings exist, the initial cards can change after asynchronous resolution.

The section hides whenever a query, filter, selected collection, or non-default browse sort is active.

### Recently added

The recently-added controller displays four shows sorted by the catalog publication date helper, then updatedAt, then title. These are catalog dates, not podcast release dates. It is therefore a measure of Echo ingestion/publication recency.

The current catalog creation dates range from 2026-06-01 to 2026-08-15 and update dates from 2026-07-18 to 2026-09-04. 721 records were updated before 2026-09-01; the recent band is concentrated in the current import/publication period.

### Collection rails

The homepage uses:

- a featured collection rail;
- a favorite-route/similarity rail.

The collection rail renders cards from data/collections.json and the show map, with carousel controls and cloned cards for the visual loop. There are 6 featured collections and 17 similarity collections in the catalog; the homepage selects the featured/favorite subsets rather than displaying all 46.

### First-time user behavior encouraged

The homepage encourages a first-time visitor to:

- start from a known favorite;
- choose completed versus ongoing;
- type a show/title/question;
- browse by use case rather than only genre;
- scan curated routes;
- open a show and follow a listening link.

It does not ask a first-time user to create an account, rate something before receiving value, complete taste onboarding, or join a community. This lowers friction but leaves repeat-visit personalization unaddressed.

## 13. Show page audit

### Complete anatomy

The show renderer can produce:

1. Header/navigation.
2. Breadcrumbs: home, optional genre, show.
3. Hero cover with responsive sources.
4. Review/confidence/status chips.
5. Title and subtitle.
6. Archive rating and listener rating summary.
7. Runtime, format, release/completion status, and episode/season facts.
8. Start/open, archive note, facts and links, and share actions.
9. Best-for listening-context strip.
10. Official description if source-backed.
11. Indexed/imported disclosure where the record is not a full review.
12. Archive review content when present.
13. Listener review carousel/card when published.
14. First-review CTA when no published listener review exists.
15. Six-category archive score breakdown when archive rating content exists.
16. Community rating/review fallback and rating controls.
17. Creators, networks, production/credit facts.
18. Source-backed/fact-check status.
19. Official website and listening-platform links.
20. Release dates, cadence, season/episode count, runtime, and transcript row if known.
21. Try next similar shows with reason text.
22. Collection appearances, with a details overflow for more than the first visible set.
23. More-from creator/entity cards when the explicit relationship qualifies.
24. Correction CTA.
25. Footer.

Not every component appears for every show. The renderer intentionally suppresses empty/unknown metadata and uses different copy for imported/indexed-only records.

### Full-review/high-quality example: Derelict

The local mobile render of /shows/derelict showed:

- full-review and top-rated treatment;
- archive rating 10/10;
- no local listener score;
- 21.7-hour runtime;
- 20 episodes across 2 seasons;
- full-cast format;
- active/ongoing status;
- 3 tags, 3 tones, and 3 best-for contexts;
- official description and archive review;
- archive score breakdown;
- community rating controls;
- 4 similar targets;
- 5 public collection routes;
- 4 outbound/listening link controls;
- factual correction CTA;
- no More-from section because no qualifying explicit entity relationship;
- title metadata: “Derelict Review, Rating & Similar Shows | The Echo Archives”.

This page demonstrates the strongest product proposition: a listener can understand what kind of commitment and experience the show offers, see an editorial judgment, and continue to reasoned next options.

### Strong relational example: The White Vault

The White Vault is a full-review record with:

- archive rating 9;
- 119 episodes across 8 seasons;
- approximately 46 total hours;
- 4 similar targets;
- 4 tags, 3 tones, and 2 best-for contexts;
- explicit entity links to Fool & Scholar, K.A. Statz, and Travis Vengroff;
- 12 collection appearances in the current public snapshot.

It demonstrates how a show can be simultaneously a review page, a creator/entity gateway, a collection hub, and a similarity anchor.

### Imported/low-confidence example: The Callisto Protocol: Helix Station

The local render of /shows/the-callisto-protocol-helix-station showed:

- imported disclosure;
- no archive score;
- listener score unavailable;
- 6 episodes;
- episodic format;
- release status not confirmed/unknown;
- no similar cards;
- no collection routes;
- no tone, best-for, or tags;
- no archive review;
- factual links/details/correction path;
- title metadata: “The Callisto Protocol: Helix Station — Episodes, Links & Details | The Echo Archives”.

This is intentionally a factual index page, not a disguised recommendation. Its limitation is discoverability: it is searchable and indexable but has few routes onward.

### Indexed-only example: The Rapscallion Agency

The Rapscallion Agency is indexed-only, has 11 episodes and one season, 2 tags, one explicit entity link, no outgoing similarity, no best-for/tone data, no RSS, and a documented research/runtime gap. It is more reviewed than an imported record but still does not have archive review content. This is an example of factual promotion without a full editorial promise.

### Completed example: Ars Paradoxica

Ars Paradoxica is full-review, archive-rated 7.5, completed/finished, 49 episodes across 3 seasons, about 26.1 hours, 4 similar targets, 2 tags, 3 tones, and 2 best-for contexts. It appears in 9 collections, including finished-arcs and completed-drama. It shows how completion status can become both page decision information and collection routing.

### Ongoing/uncertain example: Impact Winter

Impact Winter is full-review and archive-rated 10, with 3 seasons, 36 episodes, and about 18 hours. The current record says inactive/ongoing and latest verified release 2024-07-18, with a research gap about future status beyond Season 3. This makes the page richer than an imported record but exposes the lifecycle vocabulary problem described in the data-quality section.

### Unrated versus rated

Only 27 of 724 records have a meaningful archive numeric rating. A show can be full-review but unrated in the current data, as with Welcome to Night Vale in the current snapshot. The page renderer can still show full editorial content without a numeric score. Community ratings remain a separate asynchronous surface and are not statically embedded in catalog records.

### What is public versus internal on the show page

Public:

- selected source-backed status/copy;
- official/listening URLs;
- selected verification date/source wording;
- catalog metadata;
- archive review/rating if authored;
- collection/similarity relationships;
- public correction/review CTAs.

Internal/protected:

- field-level source evidence;
- importer candidate history;
- source snapshots;
- confidence calculations;
- moderation notes/reviewer identity;
- unpublished listener review content;
- candidate/collection audit events.

The page correctly avoids dumping the operational database into the listener view.

## 14. Content and editorial audit

### Manually authored content classes

Manual or editorially governed content includes:

- show descriptions and subtitles;
- official-description selection and source labels;
- archive reviews, archive takes, thoughts, and quotes;
- archive numeric/category scores;
- tags, tones, themes, content notes, best-for labels;
- collection titles, descriptions, order, featured flags, anchor shows, memberships, and reasons;
- explicit similarTo edges and similarReasons;
- entity names, aliases, types, public/indexable flags, descriptions, reviewed dates, sources, and entityLinks;
- homepage start-here route choices;
- publication/review-status decisions;
- factual verification notes and research gaps.

Generated/derived content includes:

- runtime JSON;
- search index;
- collection summaries/statistics;
- responsive image variants;
- metadata/structured data assembly;
- entity connected-show counts;
- route/sitemap output;
- rule-based collection resolved membership;
- visible archive statistics.

The backend importer may propose or prepare records and fields, but the documented contract requires explicit maintainer approval before authored catalog publication.

### Current volume of editorial work

The most direct measures are:

- 7 full-review shows;
- 27 archive-rated shows;
- 70 records with meaningful archive takes;
- 37 collections with unspecified/manual-looking description provenance;
- 20 curated collections;
- 17 similarity collections;
- 234 explicit similar-show edges;
- 97 unique shows touched by at least one non-rule collection;
- 42 typed entity records and 187 curated entity relationship rows;
- 17 shows with documented research gaps requiring human/operational follow-up.

These numbers show that Echo’s highest-value differentiation still depends heavily on manual editorial decisions, even though its catalog breadth is now largely importer-backed. The product has not automated the hardest judgment: which show meaningfully belongs in a listening route, which show is genuinely similar, and what explanation a listener can trust.

### Where editorial content adds the most value

Editorial value is especially visible when raw catalog metadata would not answer the listener’s decision:

- Try-next reasons turn an ID relationship into a recommendation;
- best-for labels translate a show into a listening situation;
- archive takes summarize a human perspective without forcing a full review;
- score breakdowns separate voice acting, sound design, story, characters, ads, and length;
- collection descriptions explain intent;
- indexed-only disclosures clarify why a page is factual rather than editorial;
- source-backed entity pages turn a credit into a trustworthy navigation route.

By contrast, imported records’ strongest value is breadth, official links, episode/season data, RSS, and source-backed existence—not opinion or deep recommendation.

### Editorial versus imported boundaries

The schema and validator prohibit imported records from carrying archive-owned subjective fields such as archive ratings, review text, thoughts, quotes, best-for, similarity, featured/popularity, and accent fields. This is an important trust boundary. It also means the 517 imported records are structurally incapable of contributing to all discovery surfaces unless someone later enriches them through an allowed review/promotion path.

### Editorial bottleneck

The project’s main editorial bottleneck is not writing a description for each show; published descriptions are broad. It is building enough high-confidence relationships and practical listening metadata for the long tail:

- 653 no outgoing similarity;
- 481 no collection;
- 651 no tone;
- 653 no best-for;
- 552 no typed entity link.

The catalog can grow faster than its discovery value unless relationship and intent coverage grow in parallel.

## 15. Provenance and trust system

### Source types and source strategy

The documented importer/source strategy is:

- RSS as the primary objective metadata source;
- Apple Search/lookup for discovery and feed URL recovery;
- Podcast Index as optional authenticated enrichment;
- official-site structured data for exact links and credits;
- unstructured extraction as reviewer assistance only;
- subjective AI suggestions kept outside the prepared record and never auto-populated into catalog fields.

At record level, source information can be represented as:

- officialDescription source label/URL/verifiedAt;
- verification status/date/source/note;
- objectiveSources;
- import metadata;
- source categories and keywords;
- latest feed item and feed notes;
- research gaps and runtime gaps.

### Verification distribution

All 724 generated records have a verification object/date/source. The status distribution is:

- automated-source-checked: 518;
- maintainer-source-reviewed: 79;
- partially-source-reviewed: 59;
- source-verified: 50;
- partially-source-verified: 9;
- source-verified-with-feed-note: 5;
- source-verified-with-future-status-note: 1;
- source-verified-with-upcoming-note: 1;
- partially-source-verified-with-feed-note: 1;
- source-verified-with-title-normalization: 1.

This is a real trust gradient, not a binary verified flag. The current generated status reports 724 metadata-checked records and 0 creator-verified shows. A creator-verification request path exists, but no current catalog record is publicly marked creator-verified under the snapshot.

### Public versus internal provenance

Public show pages expose selected fact-check/source-backed language, official-description source context, verification state, source notes, and correction links. Public entity pages expose reviewed/source-backed status and source links.

Internal SQLite provenance includes:

- import source snapshots;
- source type/key/URL;
- normalized payloads;
- field-level evidence values;
- source snapshot references;
- confidence and method;
- evidence status/selected state;
- observed timestamps;
- import candidate history;
- audit events;
- collection candidate rationale/confidence;
- reviewer/moderation metadata.

That internal layer is intentionally not published as raw evidence. It is the more detailed trust system and could support future field-level provenance views if the product chose to expose them.

### Unknown representation

Unknowns are represented through:

- blank optional values;
- explicit unknown or unclear enum values;
- researchGaps;
- runtime gaps;
- source/feed notes;
- “not verified”/“status not confirmed” copy.

This is preferable to fabricated certainty. The cost is that a large share of the catalog has visible uncertainty in lifecycle, transcript, runtime, or relationship fields.

### Consistency assessment

Strong:

- objective source arrays exist on all 724 current records;
- importer provenance exists on 656;
- public entity records require source URLs/review dates;
- imported status has strict provenance validation;
- public pages distinguish factual indexed-only/imported from archive review.

Uneven:

- the verification status vocabulary is broad and partly ad hoc;
- the public UI cannot show all field-level evidence;
- a source-backed record may still have sparse discovery metadata;
- URL syntax is validated but live source health is unknown;
- creator verification infrastructure has no current verified-show output;
- generated docs and implementation counts are stale in places.

### Trust risks

The principal trust risks are not fabricated reviews; the code is designed against that. They are:

- a listener may read source-verified as currently active/correct in every field;
- inactive/ongoing combinations can look contradictory;
- imported pages are indexable and rateable even though they are not editorially reviewed;
- platform links may remain syntactically valid while stale;
- raw creator display strings can resemble first-class creator relationships even when they are not.

## 16. Import and update pipeline

### Entry paths

Catalog data can enter through:

1. Authored/manual show and collection source files.
2. Public show/correction/listener-review/creator-verification submissions.
3. Protected importer discovery/source candidates.
4. Apple/RSS/Podcast Index/official-site enrichment.
5. Maintainer review and explicit promotion.
6. Rule/semantic collection candidate generation and membership recalculation.

The root command surface includes:

- npm start and npm run dev;
- npm run check:config;
- npm run backup:database and npm run check:backup;
- npm run build:catalog;
- npm run build:pages;
- npm run report:catalog;
- npm run report:catalogue-expansion;
- npm run check:structure;
- npm run test:tools;
- npm run verify;
- catalog:new:show and catalog:new:collection scaffolding commands.

Backend commands include start/dev, Node tests, smoke/browser setup, serial smoke, maintainer-import smoke, configuration/data/link/external-link/review/import/report commands, and entity tests. The report does not claim that all of these were executed in this audit. Database backup and import/build commands were not invoked.

### Catalog build path

The high-level flow is:

~~~text
catalog-src authored records
        |
        v
catalog loader + normalization + validation
        |
        +--> optional cover resolution/variant generation
        +--> review-companion merge
        +--> entity resolution
        +--> search index hydration
        v
data/shows.json, data/collections.json, data/entities.json,
data/reviews, data/search-index.json, archive stats
        |
        v
tools/build-pages.js -> committed HTML/CSS/JS/sitemap/output
~~~

The actual backend loader can invoke cover synchronization and persistence when a cover is missing. For this audit, the temporary server used the loader with fetching disabled, and the current records had local covers, so no source persistence was triggered.

### Import lane

The importer stores operational state separately from authored catalog source:

- candidates;
- source snapshots/cache;
- field evidence;
- identity mappings;
- jobs and lease/retry state;
- runs and event history;
- prepared/drafted records;
- confidence/readiness;
- duplicate candidates;
- staged covers;
- reviewer decisions.

Current local SQLite aggregates:

| Table/state | Rows or count |
|---|---:|
| catalog_import_candidates | 1,981 |
| catalog_import_sources | 7,747 |
| catalog_import_events | 5,412 |
| catalog_import_field_evidence | 98,048 |
| catalog_import_identities | 5,344 |
| catalog_import_jobs | 2,053 |
| catalog_import_runs | 165 |
| source cache rows | 6,545 |
| completed jobs | 2,050 |
| failed jobs | 3 |
| completed runs | 162 |
| failed runs | 3 |

Candidate statuses:

- needs-review: 1,327;
- published: 637;
- rejected: 11;
- ready: 3;
- duplicate: 2;
- failed: 1.

Candidate scope:

- in-scope: 1,254;
- borderline: 674;
- out-of-scope: 53.

Candidate modes:

- create: 1,836;
- update: 145.

Primary source types include backlog 1,828, title 52, RSS 47, Apple 36, and website 18.

These are local operational counts and may reflect development/import history rather than a production queue.

### Approval and publication contract

The documented contract is explicit:

- discovery and preparation happen in SQLite;
- imported publication requires structured-source confidence;
- indexed-only publication requires a current factual-review stamp;
- only eligible, explicitly approved candidates become published;
- a successful promotion writes the authored record and regenerates generated data;
- re-preparation invalidates stale factual review;
- AI suggestions do not auto-populate subjective fields;
- public intake never auto-publishes.

This is a strong safety model. Its cost is operator workload and the need to keep source/generated/SQLite revisions synchronized.

### Human intervention required

Human intervention remains required for:

- resolving identity conflicts;
- approving borderline/out-of-scope/import candidates;
- selecting factual tier;
- checking weak or conflicting sources;
- deciding status/runtime gaps;
- curating similarity and collection membership;
- correcting creator/entity relationships;
- reviewing public submissions;
- approving listener reviews;
- reviewing creator verification evidence;
- deciding when a record deserves an archive rating/full review.

### Scaling bottlenecks

The likely bottlenecks are:

- human review of ambiguous source identity and status;
- creator/entity deduplication;
- source freshness and feed failures;
- cover staging/storage;
- regenerating committed output after catalog changes;
- collection candidate review and override semantics;
- maintaining two notions of state: authored public snapshot and operational workflow state;
- sparse editorial metadata on imported records.

No destructive import/update job was run during this audit.

## 17. Architecture

### Stack

The repository uses:

- Node.js 22.12 or newer;
- plain browser JavaScript modules rather than a bundled React/Vue application;
- generated HTML/CSS/JS static output;
- Node and Express 5 backend;
- better-sqlite3 SQLite workflow database;
- Cheerio and fast-xml-parser for document/feed handling;
- image-size and sharp for image processing;
- Playwright as a development/browser test dependency;
- optional local Ollama/Mistral Archivist path;
- optional Turnstile for production community writes;
- optional Podcast Index authenticated enrichment;
- optional Plausible analytics injection;
- reverse proxy/systemd deployment definitions.

The root package has no version field. The backend package is version 2.0.0, the footer says v1.1.2, and the architecture document says 1.1.0. This is a release identity inconsistency.

### Directory/module map

~~~text
/catalog-src
  shows/                  canonical one-record-per-show JSON
  collections/            canonical collection JSON
  entities.json            typed creator/studio/network registry
  reviews/                optional long-form review companions

/site-src
  pages/                  authored static page sources
  partials/               head, header, footer, shared HTML
  page-manifest.json       static route/output contract

/data
  shows.json              generated public catalog
  collections.json        generated collection snapshot
  entities.json            generated entity registry
  search-index.json        generated client search index
  archive-stats.json       generated counts
  reviews/                 generated review companions

/shared
  archive-search.js        normalization, scoring, similarity parsing
  archive-entities.js      entity roles/joins/publication/indexing
  app/                     browser page/controllers/data loading
  styles/                  base/home/show/creator/collection CSS

/backend
  server.js                Express routes, static/dynamic delivery, APIs
  lib/catalog.js            load/normalize/validate catalog
  lib/show-page-render.js   show HTML renderer
  lib/entity-page-render.js entity directory/detail renderer
  lib/public-page-render.js metadata/structured-data injection
  lib/seo.js                title/description/indexability policy
  lib/sitemap.js            sitemap generator
  lib/entities.js           entity validation/loading
  lib/services/             submissions, imports, collections, community
  lib/store/                SQLite schema, migrations, persistence
  test/                     unit/integration/smoke coverage

/tools
  build-catalog.js          generated data build
  build-pages.js            committed page build
  check-structure.js        output/structure gate
  report-catalog*.js        status/report generation
  run-backend.js            local backend launcher

/deploy
  reverse proxy/systemd/config assumptions
~~~

### Rendering and data flow

The system is static-first but hybrid:

- static informational pages are generated from site-src;
- the homepage and collection directory ship prerendered shells/content and hydrate browser modules;
- show and collection detail routes are rendered by the backend from generated data;
- show pages embed a showBootstrap object for client hydration;
- creator/entity routes are server-rendered from the registry and linked shows, with client-side directory search/filter/sort;
- public data endpoints serve generated JSON;
- community/review/API state is requested asynchronously.

The root output includes a stable script.js entry and route CSS bundles. The browser uses ES module imports rather than a large compiled application bundle.

### Backend/API boundaries

The architecture and server expose:

- health;
- sitemap/robots/data;
- optional chat and chat health;
- community config/anonymous profile/ratings;
- listener review fetch/helpful actions;
- public show submissions;
- protected maintainer session;
- protected submission queue/report;
- protected import runs/candidates/evidence/publication;
- protected collection candidates/membership overrides/regeneration/audit.

The backend also owns catalog loading/validation, dynamic route rendering, source/cover workflows, and operational storage.

### Security/configuration

The server code sets security headers including CSP with a nonce, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, and X-Frame-Options. Configuration validates:

- SITE_URL origin/HTTPS in production;
- community-write requirements;
- Turnstile credentials when writes are enabled;
- maintainer secret pairing/length;
- voter-hash secret length;
- port/host/database paths;
- request/chat/submission/rating/retention limits;
- importer/cover/fetch concurrency;
- optional AI and external enrichment settings.

The .env.example names variables for these functions but no secret values were read or reported.

### Deployment assumptions

The architecture assumes:

- Node 22.12+;
- Express serving APIs and static files;
- optional Ollama at a local address;
- SQLite at backend/data/community.sqlite by default;
- reverse proxy/systemd definitions in deploy;
- a configured site URL, nominally https://echoarchives.net.

Actual proxy, process, DNS, TLS, CDN, or production behavior was not inspected.

## 18. Performance audit

### Current output and payload sizes

The current local output sizes were approximately:

| Asset/data | Bytes | Approximate size |
|---|---:|---:|
| data/shows.json | 14,974,496 | 14.3 MiB |
| data/search-index.json | 1,689,209 | 1.61 MiB |
| data/collections.json | 105,480 | 103 KiB |
| data/entities.json | 19,253 | 18.8 KiB |
| script.js | 846 | under 1 KiB entry module |
| style.css | 102,718 | 100 KiB |
| home.css | 86,223 | 84 KiB |
| detail.css | 67,809 | 66 KiB |
| collections.css | 43,782 | 43 KiB |
| generated output total measured | 17,089,816 | about 16.3 MiB |

The JavaScript entry is small because the application is split into browser modules. The catalog payload, not the entry script, is the dominant initial-data cost.

### Image pipeline

The current image inventory has:

- 724 local cover references;
- 1,294 generated cover variant rows/files;
- 16 generated info images;
- 2,038 image files total in the inspected image tree;
- no missing local cover assets;
- no external cover references in current runtime records.

Responsive cover variants and reuse/deduplication have focused tests. The image system is operationally healthier than the relationship metadata system.

### Browser/runtime cost

For 724 records:

- the browser loads the catalog/search data for client-side functionality;
- search indexes or hydrates broad metadata fields;
- the homepage builds card shells and initially renders 60 results;
- collection rails duplicate some card DOM for carousel behavior;
- show detail pages render a variable amount of related content and image sources;
- community badges can make asynchronous requests for visible cards.

The local visual pass was responsive and had no horizontal body overflow at 390 pixels. It did not measure Core Web Vitals, CPU time, network compression, memory, or real-device performance.

### Static generation/build cost

The build model has two different scaling paths:

1. Generated root/static pages and assets are written to the repository. A catalog change can cause a broad generated diff.
2. Dynamic show/collection/entity pages are rendered at request time from generated data, though public routes and sitemap metadata still need generation/validation.

The repository’s committed generated output already has substantial duplication: 83 HTML files, route CSS bundles, duplicated/indexed route aliases, and many generated entity pages. Build time and diff review grow with the number of generated pages.

The full build was intentionally not run because it writes artifacts and the worktree was already dirty. Existing focused output/image tests passed.

### Likely scaling behavior

At roughly 1,000 shows, the current client-side model is still plausible, though the 15 MiB-class payload and card/image work become more visible on mobile networks.

At 2,500 shows, search data and full show JSON become a major first-load/memory consideration. Initial rendering can remain bounded at 60 cards, but payload transfer and hydration do not remain bounded.

At 5,000 shows, a single catalog JSON plus browser-side full-text index will likely be the dominant performance constraint. Collection and similar graph computations remain manageable in Node but should not be repeatedly rebuilt in every browser.

At 10,000 shows, server-side/search-index partitioning, pagination or route-level data loading, cache strategy, and incremental generation become operationally important. The current architecture has no evidence of a remote search index, vector index, paginated API, or per-query server search path.

### Potential bottlenecks

- full catalog/search payload on every cold browser visit;
- client-side tokenization and fuzzy matching;
- image downloads for dense card rails;
- dynamic server rendering work for high-crawl show/collection/entity pages;
- sitemap and structured-data generation;
- generated-output write/diff volume;
- SQLite import evidence and source-cache growth;
- source refresh/concurrency and cover staging;
- community summary requests for many visible IDs;
- carousel DOM cloning on already long pages.

### Positive performance controls

- static-first delivery;
- bounded initial result page;
- load-more/autoload safeguards;
- local responsive image variants;
- data fetch timeouts;
- lazy Archivist loading;
- optional feature disabling;
- cache-oriented static data serving;
- route-specific CSS rather than one monolithic stylesheet;
- no mandatory account/auth round trip for browsing.

## 19. SEO audit

### Metadata implementation

The shared head and public-page renderers support:

- title;
- meta description;
- canonical URL;
- Open Graph title/description/type/image/url;
- Twitter card/title/description/image;
- theme/color-scheme metadata;
- robots directives;
- JSON-LD structured data.

Dynamic show pages create titles based on content profile:

- reviewed/rated records receive review/rating/similar-show-oriented titles;
- imported/indexed-only records receive factual episode/link/detail-oriented titles;
- collection pages use collection title and a description policy;
- entity pages use entity type/name language.

This avoids falsely calling an imported page a review.

### Generated output audit

Across 83 generated HTML files in the current output inventory:

- title tags: 83;
- canonical tags: 80;
- descriptions: 79;
- Open Graph metadata: 79;
- Twitter metadata: 79;
- robots metadata: 79;
- JSON-LD blocks: 69.

The missing canonical/description/social/robots coverage is concentrated in three legacy static show artifacts and the unmanifested contact artifact. JSON-LD is absent from utility/maintainer/legacy/template pages in a mostly intentional way. The three legacy show artifacts are the clearest stale SEO output.

### Structured data

Show structured data includes:

- WebPage;
- PodcastSeries;
- BreadcrumbList;
- genre;
- creator/producer names and entity-derived creator/producer relations;
- inLanguage;
- sameAs links for listening/official URLs;
- datePublished/dateModified.

Collection structured data includes:

- CollectionPage;
- ItemList;
- BreadcrumbList;
- show item URLs/titles;
- per-show reason text in item descriptions where available.

The show structured data does not currently include a first-class episode list, duration, aggregate listener rating, or an isPartOf list of every collection appearance. Those omissions are limitations of the current generated schema, not necessarily errors.

### Sitemap and robots

The current sitemap has 819 URLs:

- 13 static public routes;
- 724 show routes;
- 42 entity routes;
- 40 indexable collection routes.

It does not include query/filter aliases. The sitemap generator uses published shows, qualifying entities, and SEO-qualified collections rather than blindly including every authored route.

robots.txt:

~~~text
User-agent: *
Allow: /
Disallow: /api/
Disallow: /maintainer/

Sitemap: https://echoarchives.net/sitemap.xml
~~~

The production hostname in robots/sitemap is a repository configuration claim. Live DNS and production delivery were not verified.

### Indexability policy

Show pages: every published show is intended to be indexable, including imported/indexed-only records, with different title/disclosure language.

Collection pages: indexability requires a title, at least 60 characters of description, at least 4 resolved published shows, and reason text of at least 20 characters for every resolved show.

Entity pages: public/indexable registry entity plus enough linked published shows. Non-default directory query/filter/sort states are noindex/follow, preserving the clean default directory.

Homepage/collections/entity directory query state: URL-addressable for UX but intended not to create indexable duplicate pages.

Maintainer/API/error/offline pages: noindex or blocked/non-public.

### Internal linking

The strongest internal link pathways are:

- homepage to all current result/show cards;
- homepage to collection and similarity rails;
- show to up to three similar shows;
- show to up to three visible collections plus overflow;
- show/entity facts to typed entity pages;
- entity page to all connected shows;
- collection page to member shows;
- collection page to related route cards;
- footer/navigation to static trust/legal/contribution pages.

This gives Echo a meaningful SEO graph instead of only one-level show pages. It is limited by sparse relationship coverage in the underlying data.

### URL and canonical strategy

Canonical public detail URLs are clean slug/id paths:

- /shows/<show-id>;
- /collections/<collection-id>;
- /creators/<stable-entity-id>.

Legacy query/HTML routes redirect to clean paths. Internal links and the sitemap use clean paths. This is a good basis for stable long-tail pages, but title/id changes require permanent redirect preservation and source-level ID discipline.

### Pagination and crawlability

The homepage uses client-side load-more, not crawlable page-number routes. This is acceptable because individual show pages and collection routes are the primary indexable content, but it means the archive grid itself is not a sequence of crawlable paginated URLs.

Collection/entity directory sort/filter states are noindex. Collection and show detail pages server-render useful HTML rather than requiring JavaScript to reveal all core content. The local browser and source renderers support no-JS/SSR-oriented output tests, but live crawler behavior was not tested.

### Search query classes Echo is structurally positioned to target

The current templates and metadata support:

- [show title] review;
- [show title] rating;
- [show title] episodes/links/details;
- shows like [show title];
- best audio dramas for [listening situation];
- [genre] audio dramas;
- completed audio dramas;
- ongoing/episodic/serialized/full-cast fiction podcasts;
- [creator/entity] podcasts or audio dramas;
- [creator/entity] connected shows;
- [collection intent] audio drama routes;
- transcript-related show discovery where metadata is present;
- runtime/commitment-oriented searches where data is populated.

This is a structural opportunity, not proof of ranking or search demand. No external keyword research or Search Console evidence was used.

### Long-tail page value and risks

Most valuable scalable templates:

1. show detail pages, because every published show has a stable route;
2. similarity collection pages, because they encode known-title intent and reasons;
3. purpose-led collections, because they map to listening situations;
4. typed entity pages, because they capture creator/production queries;
5. completed/ongoing/format route pages, where the membership remains semantically trustworthy.

Risks:

- 517 imported pages may be thin relative to search intent despite valid metadata;
- 481 shows have no collection route;
- 653 have no similarity route;
- 42 have no official website field;
- 6 collection pages are deliberately noindex;
- the three legacy static show artifacts lack current metadata;
- some page copy can vary by unknown lifecycle/data state;
- client-only browse queries are not dedicated SEO landing pages;
- a 724-page sitemap does not prove indexing, traffic, or ranking.

## 20. Internal linking and graph analysis

### Graph layers

Echo has at least four meaningful graph layers:

1. Show-to-show explicit similarity.
2. Show-to-collection membership.
3. Show-to-entity typed relationships.
4. Show-to-external listening/official links.

The homepage/search graph and collection/entity routes sit on top of these.

### Basic graph statistics

| Graph | Nodes/edges | Interpretation |
|---|---:|---|
| Show catalog | 724 nodes | All published and sitemap-intended |
| Similarity | 234 directed edges; 71 source shows; 52 target shows | Sparse explicit recommendation graph |
| Reciprocal similarity | 44 reciprocal pairs | Some relationships are mutual, but direction remains meaningful |
| Similarity average | 0.323 outgoing edges per catalog show; 3.30 among connected source shows | Strongly concentrated in a minority |
| Collection membership | 620 rows; 243 unique covered shows | 481 show nodes have no public collection edge |
| Collection average | 0.856 memberships/show; median 0 | Highly skewed coverage |
| Typed entity | 187 edges; 172 connected show nodes; 42 entity nodes | Curated relational pilot |
| Entity average | 0.258 explicit links/show; 23.76% of shows connected | Most show credits remain fallback/display-only |

Similarity outdegree distribution is especially concentrated:

| Outgoing similar-show links | Shows |
|---:|---:|
| 0 | 653 |
| 3 | 50 |
| 4 | 21 |

### Hubs

Similarity target hubs:

- Midnight Burger: 15 incoming links;
- The White Vault: 13;
- Archive 81: 12;
- Oz 9: 10;
- Desert Skies: 9;
- Ars Paradoxica: 9;
- Malevolent: 8;
- EOS 10: 8;
- Wooden Overcoats: 8;
- Vast Horizon: 7.

Entity hubs by connected-show count:

- Realm: 21;
- Bloody FM: 17;
- iHeartPodcasts: 13;
- QCODE: 10;
- Rusty Quill: 8;
- 7 Lamb, Atypical Artists, Gimlet, Faustian Nonsense, and GZM Shows: 6 each.

These hubs can become strong navigational anchors, but they are a consequence of authored coverage and registry migration, not an inferred measure of audience popularity.

### Weakly connected and orphan-like content

“Orphan” here means no edge in a specific relationship layer, not no URL:

- 481 shows have no collection membership;
- 653 have no outgoing explicit similarity;
- 552 shows have no explicit entity link;
- 42 lack an official website field;
- 580 lack known transcript language/availability data.

All 724 show pages are still reachable through the archive’s catalog/search/sitemap mechanisms. The concern is weak onward discovery after a listener lands on a sparse page, not necessarily crawl orphanhood.

### Click depth

Typical paths:

- homepage to show: 1 click after initial page;
- homepage to collection to show: 2;
- show to similar show: 1 additional click;
- show to collection to another show: 2 additional clicks;
- show to entity to another show: 2 additional clicks;
- homepage to creators to entity to show: 3;
- search/filter to show: 1 after results are visible.

The graph is compact where it exists. The issue is coverage, not excessive depth.

### Relationship reuse

The same source relationships are reused in multiple places:

- similarTo drives show-page Try next, search similarity interpretation, and similarity route logic;
- collection showIds drive directory cards, detail membership, show-page collections, SEO qualification, and related collections;
- entityLinks drive show facts, entity directory counts, entity detail lists, More from, and entity structured data;
- archive ratings/review state drive cards, page metadata, popular fallback/ranking, and filter/status presentation.

This reuse is a strong architectural property. It also means a bad relationship or stale membership can affect several public surfaces at once.

### Graph limitations

- no unified weighted graph rank;
- no edge confidence/strength on show-to-show relationships beyond reason text;
- no field-level explanation of similarity;
- no creator graph for most legacy credits;
- no episode-level graph;
- collection edges mix editorial and rule-based semantics unless the user sees the collection type;
- current popular fallback is not a graph measure;
- no click/usage feedback enters graph ranking locally.

The current model is a strong substrate for future graph-aware discovery, but not yet a comprehensive recommendation network.

## 21. Analytics and usage information available in the repository

### What is implemented

The repository contains an optional analytics insertion point in tools/build-pages.js. It can inject a Plausible script when the build environment provides PLAUSIBLE_DOMAIN, with an optional script source override. The current generated HTML scan did not find an active Plausible script in the checked-out output.

The privacy and cookie pages state that the current public deployment does not load Plausible and describe Cloudflare Real User Monitoring as a separate anonymous performance-measurement service. Those are repository claims; no Cloudflare or Plausible account was inspected.

The application does have operational event persistence for:

- rating create/update/delete events;
- abuse events;
- submission queue state/review;
- importer candidate/run/job events;
- field-evidence selection;
- collection candidate/membership/override/regeneration events;
- optional structured access observability when configured.

These are workflow/quality events, not a complete product analytics taxonomy.

### Product events not established locally

I found no authoritative repository-level event schema proving that production tracks:

- pageviews by route;
- search queries;
- filter use;
- collection card clicks;
- similarity/recommendation clicks;
- outbound Apple/Spotify/RSS/official-listening clicks;
- creator/entity page visits;
- share attempts/successes;
- review helpful votes as product analytics;
- listener conversion from show page to listening destination;
- return visits or session cohorts.

Community rating events are stored in SQLite, but they do not provide visitor counts or a complete engagement funnel. A local database count is not a traffic measurement.

### Local operational snapshot

The read-only SQLite inspection found:

| Operational measure | Count |
|---|---:|
| Community profiles | 1 |
| Rating events | 20 |
| Active rating submissions | 0 |
| Published listener reviews | 0 |
| Helpful votes | 0 |
| Abuse events | 20 |
| Submission queue rows | 0 |
| Rate-limit rows | 0 |

The 20 rating events concern one distinct podcast/show ID and fall within a short local timestamp window on 2026-08-16. This looks like development/test or a local operational artifact, not a basis for usage conclusions.

### Metrics that should be obtained later

For strategy, the next external/live evidence set should include:

- unique users and sessions by week;
- returning-user share and return interval;
- show-page impressions by review tier;
- collection-page impressions and member-card click-through;
- similarity-route impressions and outbound next-show clicks;
- search query volume, zero-result queries, and result-click rate;
- filter combinations and empty-result rate;
- outbound listen clicks by platform and show;
- creator/entity page impressions and show clicks;
- share attempts, clipboard/share success, and referral source;
- submit/correction/creator-verification starts and completions;
- published review/rating volume and moderation turnaround;
- Google Search Console impressions, clicks, CTR, average position, indexed pages, excluded pages, and query/page pairs;
- Cloudflare request/error/cache metrics and RUM/Core Web Vitals;
- CDN transfer size, cache hit ratio, TTFB, and 404/5xx rates;
- newsletter/social/community referral traffic if those channels are used;
- source freshness/feed failure rates in the importer.

The most strategically meaningful conversion proxy is likely a show-page-to-listen-destination click, paired with repeat discovery behavior. The repository does not currently prove that this is measured.

## 22. Submission and creator workflows

### Public submission modes

The public submit page exposes four modes:

| Mode | Required/core data | Storage/handling |
|---|---|---|
| New show | Title plus at least one valid HTTP(S) link; optional creator, email, tags, status, descriptors, description, notes | show_submissions queue with typed payload/provenance |
| Correction | Existing show except creator-page correction can be entity-only; correction subtype; changed field/details; source links/notes | Moderated correction queue |
| Listener review | Known show, 1–5 headline rating, title/body, optional detailed category ratings, spoiler level/context | show_submissions, then publication into published_listener_reviews only after moderation |
| Creator verification | Known show/entity context, role, method/evidence, proof URL or contact/evidence description, requested factual updates, official links | Moderated verification submission; does not automatically mark a record verified |

The UI synchronizes the active mode into the submitted JSON payload and preserves selected show/entity context. The backend does not trust the browser alone.

### Server-side validation and anti-abuse

The submission service applies:

- supported submission type;
- title/field length and shape normalization;
- known-show validation for correction/review/verification;
- a creator-page correction exception for entity-only corrections;
- correction subtype validation;
- source URL validation;
- legal acknowledgement and current legal-version checks;
- honeypot filtering;
- IP/rate-limit checks;
- moderation status/priority defaults;
- structured payload and provenance capture.

Community rating services add anonymous profile/voter hashing, one active rating per profile/show, rate limiting, optional Turnstile, abuse-event retention, and minimum-public-threshold behavior. Listener reviews include moderation/publication state and helpful-vote tables.

### Moderation and publication

All intake is moderation-first. There is no public path that writes directly into catalog-src or generated public data. The maintainer queue can list, inspect, and review submissions. Creator verification is evidence collection and a request, not an automatic badge.

The local SQLite snapshot had zero show submissions, so the local database does not demonstrate a working end-to-end production moderation queue. Focused unit/service tests did pass for new-show, minimal title/link, honeypot, throttling, correction, creator-page correction, listener-review normalization, and creator-verification evidence cases.

### Creator-facing surface

For-creators, creator standards, submit, correction, and verification content collectively provide:

- a way to correct factual links/metadata;
- a way to submit a show;
- a way to request entity/show verification;
- an explanation that creator verification does not imply rating/review approval;
- a moderation expectation.

There is no creator account, claimed-show dashboard, private edit panel, analytics view, feed health view, or self-service publishing workflow in the inspected code.

### Infrastructure that could support contributions

The existing infrastructure already includes:

- typed submission payloads;
- legal acknowledgement/versioning;
- provenance JSON;
- source links;
- moderation statuses/priorities/reviewer fields;
- known-show context;
- creator/entity-specific correction type;
- verification evidence;
- rate limits/honeypot/Turnstile hooks;
- SQLite queue and audit records;
- separate published listener-review table;
- anonymous community profile/rating model.

The missing part is not intake storage. It is sustained participation, moderation operations, public feedback loops, and a clear distinction between verified factual metadata and creator endorsement at scale.

## 23. Maintainability and scaling constraints

### Scale matrix

| Catalog size | Technical pressure | Human/editorial pressure | Likely user-visible effect |
|---:|---|---|---|
| 1,000 shows | Current JSON/search approach remains plausible; image/data payloads grow; generated output grows | More status/link checks and more one-off exceptions | Browse still fast enough, but sparse records remain obvious |
| 2,500 shows | Full shows/search payload becomes a meaningful mobile transfer/memory cost; client indexing grows | Identity resolution and collection review become a regular queue | Search is usable but cold loads and result quality become more variable |
| 5,000 shows | Single catalog JSON and browser-side search become the primary architecture bottleneck; sitemap/build/output work increases | Manual similarity/collection/entity enrichment cannot keep pace with breadth | More pages exist, but more landing pages are shallow unless prioritization improves |
| 10,000 shows | Need for partitioned/paginated/search-backed delivery and incremental generation becomes acute; CDN/cache and crawl budget matter | Moderation, source freshness, deduplication, and editorial ranking become an operating system | Users may face generic/weak result sets and dead-end show pages without graph coverage |

### Technical constraints

#### Data files

The source model is intentionally hand-editable and one-record-per-show. That is valuable for a small curated archive, but a 10,000-record directory of JSON files creates:

- more files to validate and review;
- larger generated JSON;
- more broad generated diffs;
- more opportunity for stale source/runtime divergence;
- more need for deterministic indexing and incremental builds.

#### Client-side search

The current browser loads the full catalog and search index. It is a good low-complexity fit for 724 shows. It does not scale linearly in user experience because first-load transfer, parse, memory, and search-index hydration are paid even if a visitor searches for one title.

#### Dynamic rendering and crawl

The server can render show/collection/entity pages dynamically from generated data, which avoids generating 724 show directories in the current output. At 10,000 pages, crawl concurrency, render cost, cache behavior, and source data freshness become more important even if HTML is not all committed.

#### Images

Local variants solve external-image dependency and enable responsive delivery, but image storage and cache invalidation grow with the catalog. Cover staging in the importer adds a second image state that must stay aligned with SQLite backups and promotion.

#### SQLite operational state

The import/evidence model is relational and indexed, but source snapshots, field evidence, events, and cache rows can grow much faster than published shows. At larger scale, retention, compaction, backup, and query/reporting discipline matter. The current schema has retention/cleanup concepts, but production operational behavior was not tested.

#### Generated pages and CSS

The current output includes static templates, generated route bundles, directory/entity pages, aliases, and legacy artifacts. Every new page family multiplies generation and QA surfaces. The current generated HTML inventory is 83 files before dynamic show pages are counted.

### Human/editorial constraints

#### Identity resolution

Raw creator/network fields are too heterogeneous for blind migration. Every organization/person merge can create a wrong graph, a false claim, or an SEO page that conflates people and companies.

#### Similarity coverage

Manual reasoned similarity does not scale simply by adding rows. A useful edge needs a listener-legible explanation and should be directionally defensible. Automated similarity can produce breadth, but the current trust model forbids treating AI suggestions as editorial truth without review.

#### Collection maintenance

Rule-based membership can scale factual routes. Mood/use-case/similarity collections still require judgment, especially when lifecycle data is unknown or content metadata is sparse. A bigger catalog increases the temptation to make broad collections that behave like generic tags.

#### Provenance and refresh

The fact that a show was correct when imported does not prove its current status, feed, links, seasons, or future availability. More shows mean more freshness work even when the initial import is automated.

#### Review production

Full reviews are the most human-intensive surface. Seven reviews cannot scale to thousands without a deliberate model for which shows deserve deep editorial treatment and which can remain factual/indexed-only.

### What should remain separate at larger scale

The repository’s strongest maintainability decision is preserving separate lanes:

- factual import versus editorial review;
- public catalog versus operational workflow;
- raw credits versus reviewed entity graph;
- archive rating versus community rating;
- manual collection membership versus rule/semantic candidate evidence;
- generated output versus authored source.

Blurring these boundaries would create more severe scaling problems than the current file count.

## 24. Existing unused or underused potential

This section lists capabilities/data already present but not fully exploited by the current public product. It is intentionally evidence-based rather than a feature brainstorm.

### Field-level importer evidence

SQLite has 98,048 field-evidence rows with source URLs, source types, confidence, methods, selected state, and observed time. The public show page exposes only selected source-backed summaries. The richer evidence could support internal quality dashboards, trust explanations, targeted refresh queues, or future field-level provenance views without changing the catalog’s core identity.

### Research-gap and runtime-gap data

17 shows have documented research gaps and 4 runtime gaps are called out in generated status. These are visible to maintainers but not organized into a public “what is known/unknown” or internal prioritization surface. They are already a structured list of the exact uncertainty that blocks stronger discovery.

### Collection reason/explanation infrastructure

Collection showReasons and similarityReasons already exist and are validated. They power some public explanation copy, but the same mechanism is not generalized to every show-to-show edge or generated recommendation. The data model can already represent a reason; coverage is the limiting factor.

### Entity graph beyond the pilot

The 42-record registry and explicit role-constrained links are a usable foundation. The current 187 links cover only 172 shows, while 710 shows carry legacy creator IDs and every show carries some creator/credit field. The underused potential is carefully migrating high-confidence legacy relationships into the existing typed model, not inventing a new entity abstraction.

### Rich show fields indexed but sparsely surfaced

The search index includes facts, credits, content metadata, transcript metadata, themes, notes, and similar titles. Many of those fields are not visible in browse cards and are only conditionally visible on show pages. They could improve search/discovery quality immediately in principle, but current field completeness is low for tones, themes, best-for, content notes, and transcripts.

### Runtime and commitment data

Season count, episode count, average episode minutes, total hours, and commitment labels are present at different rates. The current collections use some commitment routes, but there is no general “under X hours,” “one season,” “long burn,” or exact episode-commitment search surface beyond the metadata/filter scaffolding.

### Transcript metadata

43 records have transcript-language data, and transcript availability is searchable. There is no transcript route, episode transcript viewer, or transcript filter experience beyond metadata search. The existing data is therefore an underused accessibility/discovery signal, not a transcript product.

### Official links and platform breadth

The runtime data contains platform-specific links beyond the primary schema in some records, including Pocket Casts, Amazon Music, Ko-fi, funding, social, and YouTube Music. The page renderer uses a selected subset. The broader link inventory could support more consistent “where to listen/support” coverage, subject to live link checking.

### Popularity field and popular route

The popular controller supports static popularity scores, but the current catalog has zero meaningful scores. This is not a hidden working popularity algorithm; it is an available ranking slot currently unpopulated. Live community summaries can fill it if production data exists, but that data was not available locally.

### Optional datasets and loaders

The schema and loader accept:

- data/reviews;
- data/creators.json;
- data/networks.json;
- data/changelog.json.

Reviews are present for 7 shows; creators, networks, and changelog datasets are absent. The optional paths are future-facing scaffolding, not current public functionality.

### Semantic collection machinery

The collection schema and backend support semantic definitions, local AI scoring, confidence, candidate evidence, manual overrides, and audit events. Current public kind counts show no semantic collection kind. The machinery is operational potential, not current listener-visible AI curation.

### Import discovery tables

The SQLite schema has discovery sources, runs, items, jobs, and related fields, but the local aggregate showed zero rows in the discovery-specific tables. Import candidates and source snapshots are populated. This suggests the broader discovery lane is present in schema but not currently active in the inspected local artifact.

### Service worker and offline behavior

The service worker caches the offline fallback shell, icons, common/info CSS, entry script, and small static dependency graph at installation, then caches successfully visited public routes/data/assets. It does not pre-download the entire catalog. This creates a useful offline/revisit foundation, but there is no visible saved-list or offline listening queue.

### Archivist context

The Archivist has a catalog-grounded context loader, chat route, lazy UI loader, sessionStorage history limited to the last 12 messages, and configurable local Ollama/Mistral. It is disabled by default and therefore contributes no current public usage evidence. Its strongest existing potential is archive-specific explanation/recommendation over data already present, not generic chat.

### Analytics injection point

The build can inject Plausible conditionally, but current generated pages do not contain the script and no local event taxonomy was found. The underused potential is measurement infrastructure, not evidence of existing product analytics.

## 25. Product inconsistencies and technical debt

Priority below reflects strategic/user impact in the current checkout, not a request to fix anything during this audit.

### Critical

No catalog integrity failure was found that requires a critical label under the local validator. The primary critical unknowns are external: production route behavior, live source reachability, production analytics, and real community usage were not inspected. They are evidence gaps, not proven code defects.

### High

| Finding | Evidence and impact |
|---|---|
| Sparse discovery graph | 481 shows have no collection, 653 no outgoing similarity, 651 no tone, 653 no best-for. A broad catalog frequently ends in a weak recommendation state. |
| Creator/entity migration gap | 42 typed entities and 187 explicit links coexist with 645 raw creator strings, 604 legacy creator IDs, and 552 records without explicit entity links. A public creator graph cannot be inferred from legacy fields safely. |
| Editorial depth mismatch | 517 imported, 200 indexed-only, 7 full-review, and 27 archive-rated. The breadth promise is much larger than the opinion/recommendation layer. |
| Visible format vocabulary duplication | Casing variants render duplicate filter labels. This is a direct browse UX/data-normalization defect. |
| Stale architecture baseline | docs/ARCHITECTURE.md says 38 collections, 523 imported, 194 indexed-only, and two blocking errors; current generated status says 46, 517, 200, and zero blocking errors. Operators and future AIs can make wrong decisions from the stale document. |
| Community/analytics claims lack local usage evidence | Rating/review services exist, but the local database has zero active rating submissions, zero published listener reviews, and no product event taxonomy. |

### Medium

| Finding | Evidence and impact |
|---|---|
| Lifecycle ambiguity | impact-winter is inactive/ongoing with a future-status gap; unknown/unclear dominates 490/498 records. |
| Missing RSS/official-site fields | 3 missing RSS records; 42 with neither structured website field. Refresh and trust depth are weaker for those records. |
| Legacy SEO artifacts | 3 old show HTML files lack current canonical/description/social/robots/JSON-LD coverage. |
| Release-version drift | No root version, backend 2.0.0, footer v1.1.2, architecture 1.1.0. |
| Public and operational collection snapshots differ | 620 public membership rows versus 557 local rule-match evidence rows; these have different semantics, but the distinction is easy to misread. |
| Static popularity is unpopulated | popular surface is fallback/live-data dependent because all static popularity scores are empty. |
| Detail data quality is uneven | 580 transcript states are unknown; total-hours runtime exists for only 42; tones/best-for/themes are sparse. |
| Public indexability includes thin factual records | Imported/indexed-only show pages are indexable by design but may have few internal routes and little editorial differentiation. |

### Low

| Finding | Evidence and impact |
|---|---|
| Contact artifact is outside manifest | contact.html appeared in generated output but is not a current manifest route, suggesting a stale/legacy artifact. |
| Optional creator/network/changelog datasets are absent | Loader support exists but can confuse documentation or future route assumptions. |
| No crawlable browse pagination | Homepage load-more is client-side; individual pages carry the SEO burden. |
| No first-class episode/season/transcript entities | Aggregate metadata is simpler but limits future detail and search depth. |
| Some route/base CSS retains historical layers | Increases style maintenance surface even where the rendered identity is coherent. |

### Cosmetic

| Finding | Evidence and impact |
|---|---|
| Search placeholder truncation on mobile | At 390 pixels the search prompt is shortened visually; function remained usable. |
| Small dense metadata/chip system | Fits the archive identity but raises contrast/readability burden on small screens. |
| Dark-only mode | All pages declare dark color scheme; no light preference exists. |

### Debt classification

The most consequential debt is semantic synchronization, not syntax:

- authored source versus generated output;
- documentation versus current generated status;
- legacy identifiers versus typed entities;
- public collection snapshot versus operational candidate/evidence state;
- review/confidence terminology versus listener interpretation;
- version labels versus actual release state.

## 26. What Echo appears optimized for today

### Inferred priority ranking

1. **Fast, low-friction browse and search.** The homepage loads a compact card surface, 60-result batches, URL state, and client-side search without account/auth.
2. **Broad source-backed catalog coverage.** 724 published records, 721 RSS links, objective source arrays on all records, and 517 imported records show a strong breadth/availability objective.
3. **Crawlable show-level acquisition.** Every published show is intended to have a canonical detail route; sitemap/structured data/canonical/robots systems are substantial.
4. **Human-curated listening paths.** 20 curated and 17 similarity collections, reasons, anchors, and start-here cards emphasize editorial discovery.
5. **Trust and factual correction.** Verification statuses, provenance, corrections, creator verification, and moderation are unusually prominent.
6. **Operational safety for future catalog growth.** Import candidates, evidence, jobs, runs, collection candidates, overrides, and explicit publication gates are more developed than the public community layer.
7. **Creator/entity discovery, selectively.** The 42-record registry and organization directory are a real new priority, but coverage is pilot-scale.
8. **Community contribution.** Rating/review/submission infrastructure exists, but current local usage is empty and writes are deployment-config dependent.
9. **Repeat/personalized use.** There is no saved list, account, follows, taste profile, recommendation history, or user-level feed.
10. **AI assistance.** Archivist exists as optional scaffolding and is disabled by default.

### Where implementation and apparent goals disagree

#### Discovery quality versus catalog breadth

The project wants to answer “what should I listen to next,” but 481 shows have no public collection, 653 have no explicit outgoing similarity, and 653 lack best-for. Breadth is ahead of onward discovery.

#### Human curation versus imported volume

The system strongly protects editorial trust, yet 717 of 724 records are not full-review. The architecture is honest about this, but the public catalog can still feel like a large directory unless the tier distinction and next paths are understood.

#### Creator relationships versus creator coverage

The new entity system is relational and careful, but most legacy creator data remains unlinked. The visible directory is therefore polished but not representative of the full creator graph.

#### Community feature presence versus community reality

Rating/review UI and moderation storage imply a community layer. The local operational snapshot cannot show any current active rating submissions or published listener reviews. Product claims should be calibrated to infrastructure, not assumed participation.

#### Analytics intent versus measured behavior

The build has optional Plausible injection and privacy copy, but no current generated script or product event taxonomy was found. The repository can describe intended measurement more confidently than actual behavior.

#### SEO surface versus search validation

The site has 819 sitemap URLs and strong templates, but no local or external evidence proves indexing, query impressions, ranking, CTR, or listen conversion. SEO is a structural investment, not a demonstrated acquisition channel in this audit.

#### Simplicity versus operational complexity

The public app is simple and static-first. The backend has a substantial workflow system with importer, evidence, collection, community, submissions, security, retention, and audit concerns. The complexity is hidden rather than absent.

## 27. Competitive research handoff

### Existing repository material

The repository contains docs/DEEP_RESEARCH_REPORT.md, explicitly labeled as a historical pre-1.0 market-research and launch-strategy snapshot. It includes prior external references and competitor discussion, but it also says its market assumptions, launch targets, and counts are not current. It should be treated as dated context, not as fresh competitive evidence. This audit does not refresh those claims.

### Research objective

The later researcher should compare Echo’s actual current product—724 shows, 46 collections, 7 full reviews, sparse but real entity/similarity graph, source/provenance model, anonymous community scaffolding, and static-first SEO surface—against the alternatives users already use.

### Competitor and substitute set

| Competitor/category | Compare specifically against Echo |
|---|---|
| The End | Fiction-only positioning; catalog size and coverage; binge-ready/completion metadata; collection breadth; fan favorites; return-soon/status handling; newsletter/distribution; creator/supporter model; SEO footprint; update frequency; hidden-gem coverage; whether recommendations are manual or algorithmic. |
| Listin’ Up | Current catalog scope; fiction/audio-drama taxonomy; list/collection model; quality and provenance; search/filter depth; user accounts/saved lists; editorial voice; discovery routes; creator participation; traffic/acquisition. |
| AudioDrama.com | Catalog breadth; show detail fields; review/rating model; search and genre/tone taxonomy; creator/network structure; collection/curation depth; freshness; official-link quality; SEO templates; community activity. |
| Podchaser | Scale and data model; credits/creator graph; lists/playlists; reviews/ratings; public versus account-gated capabilities; episode search; personalization; monetization; SEO and API/data advantages that Echo cannot match with a static catalog. |
| Goodpods | Audio-drama category/rankings; social discovery; reviews/comments/subscriptions/shares; ranking inputs; account friction; noise versus trust; outbound listening behavior; creator promotion. |
| Apple Podcasts | Platform charts/search; editorial collections; show/episode metadata; ratings/reviews; personalization; completion/status/tone limitations; direct listening conversion; search-result ownership. |
| Spotify | Algorithmic discovery; recommendations; user history; charts; playlists; fiction-specific metadata; creator tools; social sharing; listening conversion; platform moat. |
| Podcast Addict and similar podcast apps | Search/filter/playlist/offline features; user workflows; episode-level discovery; catalog freshness; whether users need a separate editorial archive. |
| r/audiodrama and recommendation communities | Volume/quality of recommendation requests; language users use; trust dynamics; repeat questions; discovery gaps; creator self-promotion; migration/referral opportunities; what structured archive pages fail to capture. |
| Creator networks/directories | Official catalog quality; cross-show navigation; creator ownership/verification; promotion and newsletter loops; whether Echo can become a trusted independent layer rather than a duplicate network site. |

### Exact comparison dimensions

The external researcher should collect, where available:

- total catalog size and fiction-only catalog size;
- number of truly active/updated shows;
- proportion with status, completion, runtime, format, tone, content notes, transcripts, RSS, official site, and platform links;
- search fields and ranking logic;
- typo tolerance and natural-language “shows like” behavior;
- collection count, collection types, membership quality, overlap, and update frequency;
- recommendation graph density and explanation quality;
- creator/entity coverage, roles, aliases, claimed/verified workflows, and identity resolution;
- archive/editorial review depth versus imported facts;
- listener ratings/reviews, moderation, helpfulness, and account requirements;
- saved lists, follows, personalization, onboarding, and repeat-use loops;
- newsletters, social distribution, community presence, and creator repost behavior;
- SEO page templates, canonical/indexation behavior, sitemap scale, and long-tail rankings;
- page performance and mobile usability;
- monetization, sponsorship, supporter model, subscriptions, and creator tools;
- update/freshness monitoring and source provenance;
- traffic, search visibility, social presence, and referral patterns where public data permits.

### Questions the repository cannot answer

- Which competitors currently receive more organic traffic or rank for Echo’s intended queries?
- Which pages actually convert visitors into listening sessions?
- How many Echo show pages are indexed, and for what query positions?
- Are users returning, and what creates the return habit?
- Do creators want a factual verification route or a claimed-show dashboard?
- How large is the reachable audience for “shows like X,” completed, mood, or commitment queries?
- Are the 724 catalog records current on their external platforms?
- Which collection concepts have real demand rather than editorial plausibility?
- How much does the current archive visual identity help or hinder conversion?
- What are competitors’ actual moderation, source, and update workflows?
- Which community channels will tolerate Echo links and under what norms?
- What monetization would be acceptable without compromising editorial independence?

## 28. Strategic questions raised by the audit

### Positioning and audience

- What single listener job should Echo own first: shows like X, completed fiction, mood/atmosphere, or trusted hidden-gem discovery?
- Is the best initial audience existing audio-drama fans with reference shows rather than new listeners?
- Should Echo describe itself as an archive, directory, recommendation guide, review site, or a combination?
- Which part of the archive identity makes a listener trust the next recommendation?
- What does Echo do materially better than Spotify plus a Reddit recommendation thread?
- Which competitor features should Echo intentionally not copy?
- Is independence useful mainly as a trust signal, or can it become a real acquisition advantage?

### Catalog and quality

- Is 724 the right breadth for the current editorial/relationship depth, or is the catalog already too broad for the visible discovery layer?
- Should the next unit of work be more shows, more reasons, more collections, more creator links, or more reviews?
- What level of source freshness should qualify a show as active, completed, hiatus, or unknown?
- How should unknown/unclear lifecycle states be presented so honesty does not become decision paralysis?
- Which fields are truly predictive of a listener’s choice: tone, format, runtime, completion, narrator, cast, or production style?
- Should imported/indexed-only pages be indexable everywhere, or only when they have meaningful onward links?
- What is the minimum useful depth for a show page to avoid becoming a dead end?

### Recommendation system

- Can Echo own “shows like X” as a trustworthy search category?
- How much stronger would 5–10 high-quality reasoned links per anchor show be than another 100 imported records?
- Should similarity remain manually authored, become candidate-assisted, or use a hybrid confidence model?
- What makes a similarity explanation credible to a listener?
- Can shared collection/entity/metadata signals create useful candidate recommendations without pretending to be editorial judgment?
- How should directionality work: “listeners who like X may like Y,” “Y shares traits with X,” or both?
- What recommendation signals should never be combined because they mean different things?
- How can hidden-gem discovery avoid collapsing into popularity?
- What is the right cold-start path for an unreviewed, unlinked show?
- Could anonymous ratings eventually improve ranking without requiring accounts?

### Collections

- Which current collections produce a real decision outcome rather than a taxonomy label?
- Are 46 collections too many, too few, or simply uneven?
- Which collections deserve permanent SEO landing pages?
- Should the largest rule-based collections remain public collections or become filter facets?
- How much overlap is useful before collections feel redundant?
- Can a collection carry a clear commitment guarantee when runtime data is incomplete?
- Should every public collection have a human-authored description and member reason?
- What is the editorial policy for adding a show to an existing route?
- Are similarity collections the best acquisition surface, or should they remain navigation inside show pages?

### Creator/entity system

- Which raw creator/network values are safe to migrate into the typed registry?
- Should the public entity graph include individual people, or remain organization-first?
- Does “More from” create enough value to justify the identity-resolution work?
- Can creator pages become a meaningful acquisition channel without allowing creators to control editorial ratings?
- What exactly should “creator verified” mean at the field level?
- Should entities have roles for publisher, distributor, platform, or sponsor, or should those remain show facts?
- How should collaborations, aliases, former names, and shared networks be represented?
- Is an organization directory useful to listeners, creators, search engines, or primarily maintainers?
- Which 42 current entities are strong enough to become anchor pages, and how many additional links are needed first?

### Community and trust

- Is the right community feature rating, short structured reviews, recommendation submissions, or discussion?
- Can anonymous ratings reach a credible threshold without accounts or active distribution?
- What moderation capacity is sustainable for listener reviews?
- How should community scores remain distinct from archive ratings on cards and search?
- Would a “verified factual metadata” state be more valuable to creators than a public badge?
- How can Echo expose provenance without overwhelming listeners?
- What source-failure or stale-link experience protects trust?
- Which corrections should be publicly visible as changelog entries?

### SEO and acquisition

- Which template has the highest marginal value: show review, shows-like route, completed route, collection, creator, or hidden-gem page?
- Is the current 724-page sitemap too broad for the depth of imported records?
- Should the archive create more indexable intent pages, or improve internal links among existing pages?
- How can query/filter behavior produce useful canonical landing pages without generating thin duplicates?
- Which content needs a human perspective to rank/convert rather than merely a template?
- Could creator verification and source notes create defensible long-tail trust signals?
- What external communities will accept useful Echo links?
- How should Echo distribute a new collection or review so it compounds rather than expires?

### Repeat usage and product loop

- What would make someone return after finishing a show?
- Should the first repeat-use feature be a saved list, a “what next” history, a follow/alert, or a personalized taste profile?
- Can Echo provide value anonymously before introducing any account layer?
- Should a user be able to save a collection/show locally without registration?
- What data is safe to store locally under the existing privacy posture?
- Could the service send owner-directed reminders for new/relevant shows without becoming a generic notification system?
- What is the smallest behavior that proves habit: two show pages, a listen click, a return visit, or a saved route?

### Operations and sustainability

- What fraction of imported candidates should stay imported versus become indexed-only or full-review?
- How much manual time is available per week for source checking, similarity, collections, and reviews?
- Which workflows should be automated first without weakening trust?
- What is the cost of live external source refresh at 2,500/5,000/10,000 shows?
- Should generated output remain committed to Git as the catalog grows?
- What operational evidence must be backed up with SQLite and staged covers?
- Which metrics are needed before making any strategic bet?
- What is the acceptable supporter/revenue model for a niche independent archive?
- What would cause the owner to deliberately keep Echo small?

## 29. Evidence appendix

### High-value repository paths

Repository root:

- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/package.json
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/package.json
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/README.md

Catalog/data:

- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/data/schema.md:1-21,23-30,32-163,388-460
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/catalog-src/shows/
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/catalog-src/collections/
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/catalog-src/entities.json
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/data/shows.json
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/data/collections.json
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/data/entities.json
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/data/search-index.json
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/data/archive-stats.json
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/docs/generated/catalog-status.md
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/docs/generated/catalog-status.json

Architecture/operations:

- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/docs/ARCHITECTURE.md:18-45,56-118,196-230,313-405
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/docs/OPERATIONS.md
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/docs/IMPORTER.md
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/docs/CREATORS.md
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/docs/SEO.md
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/docs/DEEP_RESEARCH_REPORT.md:1-14

Backend:

- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/server.js:161-182,517-590,593-713,715-775,788-900,942-1037
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/lib/catalog.js:57-68,70-93,129-294,296-604
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/lib/entities.js:14-79
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/lib/seo.js:1-110
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/lib/sitemap.js:19-69
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/lib/show-page-render.js:217-742
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/lib/entity-page-render.js:1-365
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/lib/public-page-render.js:192-335
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/lib/config.js:1-285
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/lib/services/submission-service.js:700-1031
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/lib/services/community-service.js
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/lib/store/database.js:1-260,389-497,614-659
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/data/community.sqlite

Frontend:

- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/shared/archive-search.js:1-415
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/shared/archive-entities.js:1-240
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/shared/app/data.js
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/shared/app/pages/home.js:1-260
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/shared/app/pages/home/results.js:1-220
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/shared/app/pages/home/most-popular.js:1-163
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/shared/app/pages/home/recently-added.js:1-58
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/shared/app/pages/collections.js
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/shared/app/pages/entity-directory.js
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/shared/app/pages/show.js
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/shared/app/mobile-nav.js:1-212
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/shared/app/share.js

Page/build/config:

- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/site-src/page-manifest.json
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/site-src/partials/head.html
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/site-src/partials/footer.html
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/tools/build-pages.js:338-349
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/tools/lib/catalog-artifacts.js:153-182
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/backend/.env.example:1-57
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/sitemap.xml
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/robots.txt

Representative records:

- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/catalog-src/shows/the-white-vault.json:1-16,112-125,189-201
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/catalog-src/shows/vast-horizon.json:1-16,182-197
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/catalog-src/shows/derelict.json:100-110,170-176
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/catalog-src/shows/dont-mind.json:1-8,104-116,781-785
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/catalog-src/shows/impact-winter.json
- /Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/catalog-src/entities.json:39-86

### Exact command/validation evidence

The following safe commands were run from the repository root:

~~~text
rtk git status --short --branch
rtk git diff --check
rtk node --test backend/test/seo.test.js backend/test/sitemap.test.js \
  backend/test/submissions.test.js tools/test/seo-output.test.js \
  tools/test/responsive-images.test.js
~~~

Focused test result:

~~~text
32 tests passed
0 tests failed
duration: 1416 ms
~~~

The tests covered SEO titles/structured data/canonical/indexable collections, sitemap XML/routes, show/correction/listener-review/creator-verification submissions, cover variants, responsive images, generated metadata/structured data/private pages/asset plumbing/archive stats.

The local diff check produced no output and therefore passed. The full npm verify was not run because it includes build/write/import-sensitive work.

### Read-only count scripts and results

The analysis scripts loaded generated JSON and counted:

~~~text
shows: 724
collections: 46
registry entities: 42
visible organization entities: 40
flattened creator assignments: 751
unique raw creator strings: 645
unique legacy creator IDs: 604
explicit entity links: 187
shows with explicit entity links: 172
similarity edges: 234
shows with outgoing similarity: 71
public collection memberships: 620
shows covered by collections: 243
full reviews: 7
archive-rated shows: 27
imported: 517
indexed-only: 200
RSS links: 721
missing RSS: 3
~~~

Sitemap count:

~~~json
{"total":819,"shows":724,"creators":42,"collections":40,"static":13}
~~~

Local SQLite table aggregate:

~~~text
catalog_import_candidates 1981
catalog_import_sources 7747
catalog_import_events 5412
catalog_import_field_evidence 98048
catalog_import_identities 5344
catalog_import_jobs 2053
catalog_import_runs 165
collection_candidates 26
collection_events 70
collection_membership_overrides 0
collection_runs 17
community_abuse_events 20
community_profiles 1
listener_review_helpful_votes 0
podcasts 724
published_listener_reviews 0
rate_limit_events 0
rating_events 20
rating_submissions 0
show_submissions 0
~~~

These database counts were read without printing profile IDs, hashes, IP addresses, raw source payloads, or secret values.

### Browser evidence

The local visual/browser pass used a temporary server outside the repository and existing Brave:

- desktop homepage at 1462 by 709;
- mobile homepage/collections/show/creator/submit at 390 by 844;
- mobile nav open/close and focus/ARIA state;
- homepage search/filter/no-results states;
- show pages for Derelict, The Callisto Protocol: Helix Station, and The Rapscallion Agency;
- collection route Shows like Midnight Burger;
- creator directory/search and Fool & Scholar detail;
- direct K.A. Statz and Travis Vengroff detail behavior.

Observed examples are recorded in sections 10–13. No production tab, remote URL, or live API was inspected.

## 30. Machine-readable snapshot and final audit conclusion

ECHO_AUDIT_SNAPSHOT.json accompanies this report. It contains summarized metadata, exact headline counts, completeness, distributions, feature states, route families, quality issues, stack, SEO capabilities, recommendation signals, operational aggregates, scaling limits, and verification boundaries. It intentionally does not contain the full 724-record catalog or sensitive operational rows.

The forensic conclusion is:

> Echo is a serious, source-aware, static-first audio-fiction discovery archive with a strong visual identity and unusually mature catalog-operations scaffolding. Its core limitation is not an absent foundation. It is uneven depth: a 724-show breadth layer exists, but only a small fraction of shows currently participate in the editorial, similarity, collection, creator, community, or personalized loops that would make the archive habit-forming and defensible.

The next strategic analysis should therefore treat Echo as two coupled products:

1. A public listener discovery surface that is already coherent, crawlable, and visually distinctive.
2. A protected catalog/trust operating system that could support a much stronger recommendation graph if its existing signals are prioritized and measured.

The repository supports a specific strategy conversation. It does not, by itself, answer market size, competitor traffic, search demand, retention, or production conversion. Those require the external/live evidence listed above.
