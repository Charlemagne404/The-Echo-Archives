# 005 — Visual restraint and Listener Library surfaces

**Status:** accepted for 2.0<br>
**Date:** 2026-09-29

## Decision

Echo 2.0 may substantially improve behavior without substantially increasing Echo’s visible UI footprint. Preserve the compact, content-first information architecture and visual restraint of Echo 1.2.x. Prefer improvements to existing surfaces; add a public page or top-level navigation item only when a user problem cannot reasonably fit the current Echo structure.

Remove the dedicated `/library` management page, route, navigation item, and page-only UI. Keep the Listener Library service and its IndexedDB persistence, schema, validation, recovery, import/export APIs, sanitized Personal Discovery context, and cross-tab notifications.

Show cards may expose one small state/status affordance outside their full-card link. It must remain secondary, preserve card height, support touch and keyboard, and offer state changes/removal without private rating. Show details may expose state, removal, and private rating in a compact disclosure within the existing listening action area. Archive Rating, Community Rating, and private listener rating remain distinct.

There is no standalone public UI for Library search, sorting, management, import/export, or recovery. The Personal Discovery preference is a contextual checkbox inside the existing show-detail Library disclosure; it does not create a settings page or navigation destination. Recovery UI may be offered only when a real storage recovery situation requires it.

## Why

The old page expanded navigation and created a new product destination for functionality that fits existing cards and show pages. Echo’s primary task is show discovery; the compact browse layout and current information architecture are intentional. Keeping the local platform while removing the oversized surface preserves useful behavior and privacy without turning Echo into a dashboard.

## Consequences

- `/library`, `/library.html`, `library.css`, page-only controllers, route metadata, sitemap/noindex/analytics handling, and page-specific tests are removed.
- Without opt-in, Library state does not affect public discovery. With opt-in, `hidden` suppresses only that exact show in eligible personal results; it never changes catalogue truth, exact-title lookup, or direct show access.
- Service-level backup, import, reset, recovery, and preference APIs remain covered independently of public UI.
- Build/cache versioning tracks the Library modules imported by production controls, not removed page modules or a removed page stylesheet.
- Product and release reviews compare navigation, page hierarchy, cards, show pages, homepage, collections, and creator pages with the 1.2.x structure.

## Revisit only if

Observed listener work demonstrates a management task that cannot reasonably fit existing show/discovery surfaces, and a proposed solution states its visible footprint, privacy behavior, and mobile/navigation cost.
