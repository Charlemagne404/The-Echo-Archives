# Mobile QA

## Verification date

- June 2, 2026

## Local environment

- URL: `http://127.0.0.1:3010`
- Browser path: Codex in-app Browser
- Viewports checked:
  - desktop `1280x720`
  - mobile `390x844`
  - narrow mobile `320x740`

## Routes checked

- `/`
- `/collections.html`
- `/collection.html?id=best-for-long-walks`
- `/show.html?id=solar`
- `/about.html`
- `/submit.html`

## What was verified

- Each route loaded with the expected title and visible page content.
- No framework error overlay appeared on any checked page.
- Console warnings and errors were clean across the main routes.
- No real horizontal overflow appeared at the tested mobile widths.
- Homepage filters opened correctly on mobile.
- Show-page community rating controls remained interactive on mobile.
- Submit-page correction mode still revealed the existing-entry selector on mobile.

## Findings

- No launch-blocking mobile issues were found on the main archive routes.
- The submit page includes intentionally off-canvas honeypot fields. They appear in raw geometry checks but do not create visible overflow or broken layout.

## Release stance

- Mobile behavior is acceptable for launch on the main public pages.
- Future QA should still include a manual pass on a real phone before larger visual changes ship.
