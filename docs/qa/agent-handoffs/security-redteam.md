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
- Combined verification: Pending fast-forward integration into the shared branch; task-branch post-rebase full verification passed as listed above.
- Final overnight integration commit: Pending.
- Push result: Pending; only task and `codex/overnight-integration` branches may be pushed.
