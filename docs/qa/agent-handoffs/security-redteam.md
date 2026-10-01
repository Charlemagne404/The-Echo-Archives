# Security and trust-boundary red-team handoff

- Task slug: `security-redteam`
- Task branch: `codex/overnight-security-redteam`
- Starting integration commit: `aa81d5d088508e65822ea059af5928569e2c4043`
- Task implementation commit: `238d9b971adb622ea8bc51f715615e447fa4f786`
- Changes made: Revoked maintainer sessions server-side at logout; keyed community rating and helpful-vote limits by a stable IP pseudonym independent of User-Agent and voter cookie; made service-worker caches honor `Cache-Control: no-store`; made malformed durable collection and listener-review JSON fail closed; added regressions, reused the incoming test-only visible static-root alias, documented implementation-linked invariants, and wrote the dated security report.
- Bugs found and fixed: Copied maintainer cookies survived logout; community rating/helpful-vote limits could be split by User-Agent rotation; the service worker cached no-store responses; malformed durable JSON was silently returned as empty data.
- Important files and subsystems touched: `backend/lib/maintainer-auth.js`, `backend/lib/services/community-service.js`, `backend/lib/services/published-listener-review-service.js`, `backend/lib/store/collection-store.js`, `backend/lib/store/database.js`, `backend/lib/store/published-listener-review-store.js`, `backend/package.json`, `backend/server.js`, `tools/build-pages.js`, generated `sw.js`, focused backend/browser tests, `docs/qa/SECURITY-INVARIANTS.md`, and `docs/qa/2026-09-30-security-redteam.md`.
- Tests and results: `rtk proxy npm --prefix backend run test:security` passed 43/43; `rtk proxy npm --prefix backend run test:security:browser` passed 1/1; `rtk proxy npm --prefix backend run test:library:product` passed 4/4; catalogue and page builds passed; both npm audits reported zero vulnerabilities; post-rebase `rtk proxy npm run verify` passed with 450/450 serial tests and all required Chromium batches at zero failures and skips. Combined post-integration verification is pending.
- Known limitations: Import URL DNS answers are checked before the fetch client separately resolves/connects, leaving a DNS-rebinding/SSRF time-of-check/time-of-use gap. No request to an internal target was attempted. Production proxy topology, HSTS, CDN behavior, egress controls, and live deployment were not inspected. Details are in `docs/qa/2026-09-30-security-redteam.md`.
- Dependencies changed: None. No package dependency or lockfile upgrades.
- Generated artifacts changed: `sw.js` was regenerated with `npm run build:pages`; generated ignored HTML outputs were not committed.
- Interactions with likely other campaigns: Under the integration lock, read and preserved `docs/qa/agent-handoffs/disaster-recovery.md`. Its startup manifest/redirect validation, malformed podcast metadata handling, gateway fallback behavior, and `backend/test/helpers/visible-static-root.js` are retained. The competing `codex/overnight-test-quality` branch was not integrated.
- Compatibility concerns: Existing maintainer cookies use the old stateless format and are rejected, requiring a fresh login. Database startup creates the session table and expiry index through normal schema setup. The service-worker cache version changes to retire the prior policy cache.
- Things later agents must preserve: Logout must revoke the database session, not only clear the browser cookie; rating and helpful-vote rate limits must not include User-Agent or voter cookie in bucket identity; no-store responses must not remain in Cache Storage; malformed durable JSON must not be normalized into trusted empty state or overwritten by a read; preserve the disaster-recovery changes named above.

## Integration notes

- Keep the DNS-rebinding connection-time address-pinning gap visible for follow-up. Preserve host and TLS-name validation if pinning is implemented.
- Configure `TRUST_PROXY` only for the actual production proxy chain. Confirm the external edge supplies HSTS and blocks direct-origin bypasses before making production infrastructure claims.
- Preserve the security report and source-linked invariant map through main reconciliation.
- Do not merge, rebase, cherry-pick, or push this work to `main` as part of overnight integration.

## Integration result

- Pre-integration shared commit: `8fe71ecf0e5d2a5aae686ba385964182e259cc47`; shared worktree was clean on `codex/overnight-integration`.
- Rebase/conflicts: Rebased onto the shared tip. Manually combined the service-worker generator/generated worker and overlapping browser smoke/helper changes; retained both the no-store cache rule and disaster-recovery 502/503/504 offline fallback, and reused `visible-static-root.js` without carrying a duplicate helper. A stale test-helper import left by the conflict resolution was caught by focused tests and fixed. No unresolved conflicts or task-vs-startup-code semantic conflicts remain.
- Prior handoffs incorporated: `disaster-recovery.md`, read under the lock; the changes it records are preserved.
- Combined verification: After fast-forward integration, `test:security` passed 43/43, `test:security:browser` passed 1/1, and `test:library:product` passed 4/4. The integrated `rtk proxy npm run verify` passed catalogue/page builds, structure, generated checks, release-artifact checks, tooling (149 pass, 5 environment-gated skips), determinism, and the 450/450 serial backend suite; the required browser chain then recorded a cancelled `test/mobile-launch.smoke.js` with “Promise resolution is still pending but the event loop has already resolved” and child exit 143. The runner proceeded into later smoke files after the nested child failed, but the command session detached before an aggregate was captured. The same source tree had passed the full verify, including every required Chromium batch with zero skips, on the task branch immediately before integration. Following protocol, the integrated full run was not repeated to force a green result; see the dated report for this characterization.
- Final overnight integration commit: `8e471b40dfb1e237d6fa15347a3169bf7cde6640` (fast-forward of the task branch into `codex/overnight-integration`; integration-result documentation is recorded in subsequent branch history).
- Push result: `codex/overnight-security-redteam` was pushed successfully to `origin` at `6c38e3c745c77bd16a9999befd5c185d3945482b`. `codex/overnight-integration` was pushed successfully at `c9ab18c11348e820fb0abf646f82b33fe1c94ce8`; this final handoff result commit will also be pushed to that branch. No `main` branch operation occurred.

## Consolidated candidate follow-up — DNS rebinding

The address-pinning gap described above was resolved on `codex/2.0-consolidated`. Production importer requests now resolve and validate the complete A/AAAA answer set, reject mixed or non-public answers, and pass only that validated set to a custom Node HTTP lookup callback. The request keeps the original canonical hostname for the HTTP Host header and HTTPS TLS server name; certificate verification stays enabled. Redirects are manual, bounded, and use the same resolve/check/pin sequence on every hop. The per-host concurrency and Apple request limits remain in effect around the pinned transport.

Implementation and deterministic regression evidence are in `backend/lib/import/fetch.js`, `backend/lib/services/import-service.js`, and `backend/test/fetch-safety.test.js`; current policy and operational notes are in `docs/qa/SECURITY-INVARIANTS.md` and `docs/IMPORTER.md`. The dated security and consolidation reports remain historical records of the earlier review state.

This closes the DNS change between application validation and the importer connection. It does not establish host-level egress filtering or production proxy/NAT64 topology. A globally reachable server that itself proxies requests remains outside the importer's address-validation boundary.
