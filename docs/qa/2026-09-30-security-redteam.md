# The Echo Archives security red-team review

**Review date:** 2026-09-30

**Review base:** `aa81d5d088508e65822ea059af5928569e2c4043` (`codex/overnight-integration`)

**Task branch:** `codex/overnight-security-redteam`

**Scope:** adversarial review of authentication, authorization, abuse controls, stored-data integrity, HTTP/static delivery, offline caching, browser-local personalization, and importer network boundaries. This was a local code-and-test review. No production credentials, live deployment, external edge configuration, or internal network target was used.

## 1. Result and method

Four implementation defects were confirmed by inspection and regression tests, fixed on the task branch, and verified. The highest-impact confirmed defect allowed a copied maintainer cookie to remain usable after logout. The other three affected write throttling, browser cache policy, and handling of malformed durable JSON. No new product surface or dependency was added.

The review traced trust transitions from HTTP routes into service and persistence layers, examined static/service-worker delivery and browser-local state, and ran focused, full repository, and dependency checks. Confirmed defects are separated below from controls that passed and the importer DNS-pinning gap that was not exploited.

## 2. Finding F-01 — logout did not revoke a copied maintainer cookie

**Severity:** Medium (P2) — fixed.

**Impact:** Anyone who had copied a valid maintainer bearer cookie could continue using protected moderation, import, publishing, and analytics endpoints until the signed expiry, even after the maintainer logged out. This required prior access to the cookie; it did not bypass passphrase login by itself.

**Reproduction:** Log in and retain the `echo-maintainer-session` cookie; send `DELETE /api/maintainer/session`; replay the retained cookie to a protected maintainer route. Before the fix, the expiry-only HMAC token remained valid. The old test omitted the Cookie header on the post-logout request and therefore did not test revocation.

**Fix:** Tokens now include a random 256-bit session id and are accepted only when the matching non-expired database session exists. Logout deletes that row. Expired rows are pruned when a new session is issued. The regression replays the same pre-logout cookie and expects 401. Existing stateless cookies are intentionally rejected after this change and require a fresh login.

**Implementation/tests:** `backend/lib/maintainer-auth.js`, `backend/lib/store/database.js`, `backend/server.js`, `backend/test/maintainer.test.js`.

## 3. Finding F-02 — community write limits could be split by changing User-Agent

**Severity:** Medium (P2) — fixed.

**Impact:** Rating and helpful-vote throttling shared a key derived from daily IP plus User-Agent abuse evidence. A client on one address could rotate User-Agent values and device cookies to obtain separate rate-limit buckets. This weakened aggregate-integrity and abuse controls; it did not expose another voter’s profile or bypass the separate one-vote-per-device behavior.

**Reproduction:** With a test limit of two writes per minute, submit twice from one IP using distinct User-Agent and voter-cookie values, then submit a third time from the same IP using another pair. Before the fix, the old per-User-Agent key selected a new bucket. The regression covers both ratings and helpful votes.

**Fix:** Rate-limit keys now use a domain-separated HMAC of the normalized source IP and configured voter hash secret. Daily IP/User-Agent HMACs remain separate for abuse evidence and retention. Tests prove that rotating either User-Agent or voter cookies from the same IP still receives 429.

**Implementation/tests:** `backend/lib/services/community-service.js`, `backend/lib/services/published-listener-review-service.js`, `backend/test/community.test.js`, `backend/test/published-listener-review.test.js`.

## 4. Finding F-03 — service-worker Cache Storage ignored `no-store`

**Severity:** Low (P3) — fixed.

**Impact:** The service worker put successful same-origin navigation and asset responses into Cache Storage even when the origin explicitly returned `Cache-Control: no-store`. The confirmed maintainer page shell is public static markup, not a response containing authenticated moderation data, so this review confirmed a storage-policy violation and offline persistence, not disclosure of protected records.

**Reproduction:** With the service worker controlling a browser, navigate to or prefetch `/maintainer/submissions.html`, whose response is marked `no-store`, then inspect Cache Storage. The new real-browser regression asserts that the response remains 200 with `no-store` but has no cache entry.

**Fix:** All worker cache paths share `storeResponseIfAllowed`; it refuses non-success and `no-store` responses and removes a matching old entry. The generated worker policy version is part of the cache version so older worker caches are superseded. The authored generator and generated `sw.js` were both updated.

**Implementation/tests:** `tools/build-pages.js`, `sw.js`, `backend/test/browser.smoke.js`.

## 5. Finding F-04 — malformed stored JSON was silently treated as empty data

**Severity:** Low (P3, data integrity) — fixed.

**Impact:** Invalid JSON or a wrong top-level shape in persisted collection-candidate definitions/evidence or published listener-review lists was returned as an empty object/list. That hid durable corruption from callers and could make later decisions operate on incomplete state. This review found no public request path that can write arbitrary bytes into these database fields; the issue is fail-open behavior after corruption, not a demonstrated remote database-write exploit.

**Reproduction:** Corrupt `collection_candidates.definition_json` or a published listener review’s `best_for_json`, then read the record. Before the fix the caller received empty data. Regression tests now require `malformed_stored_json` and assert that the raw database value is unchanged.

**Fix:** The stores distinguish explicit legacy-empty values from malformed JSON and invalid shapes. Malformed durable values throw and are not repaired or overwritten during reads.

**Implementation/tests:** `backend/lib/store/collection-store.js`, `backend/lib/store/published-listener-review-store.js`, `backend/test/collection-service.test.js`, `backend/test/published-listener-review.test.js`.

## 6. Attacks probed and controls that held

- **Session and maintainer boundary:** anonymous maintainer API calls and the protected external-verification asset are rejected; disabled maintainer auth returns 404; login and authenticated queue updates work. Cookies are HttpOnly, SameSite=Lax, root-scoped, and marked Secure for HTTPS requests. The copied-cookie-after-logout case is now revoked.
- **Public submission/moderation boundary:** public submission does not publish a record directly; listener reviews must be accepted before publication; production Turnstile configuration and verification fail closed. Review endpoints return only public published fields.
- **Request parser and path probes:** malformed JSON, a 30 KB JSON body, unsupported `text/plain`, encoded traversal/file paths, and stack-detail leakage probes fail safely (400/413/404 as appropriate).
- **Browser persistence and cache boundary:** real Chromium checks passed for local IndexedDB behavior, malformed data and migration handling, stale tabs, no unrelated Library network/analytics effects, API/non-GET service-worker bypass, and the new `no-store` check.
- **Output and browser policy:** renderer tests cover HTML escaping. The application sets a nonce-based CSP, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, restrictive referrer/permissions policies, and API `no-store` headers.

These results establish the tested local implementation boundary. They do not prove the behavior of a production proxy, CDN, browser extension, host filesystem, or external service.

## 7. Unresolved risk — importer DNS rebinding / connection-time pinning

**Severity:** Medium residual design risk; not reproduced against an internal target.

`backend/lib/import/fetch.js` resolves DNS and rejects a hostname if any observed answer is private, and it validates each manual redirect. The subsequent global fetch resolves the hostname independently. If DNS changes between validation and the connection, the fetched destination may differ from the address set that passed validation. Import work is in a maintainer-protected workflow, which narrows who can trigger it, but does not eliminate SSRF impact if a maintainer processes an attacker-controlled source URL.

The current tests prove private IP/literal and private DNS-answer rejection before the injected fetch is called, plus redirect, byte, timeout, and content-type bounds. No request to a real internal service was attempted. Recommended follow-up is to pin the validated address into the connection’s DNS lookup/dispatcher while preserving the original Host header and TLS server name, test rebinding deterministically, and retain host/network egress filtering as defense in depth.

## 8. Dependencies and deployment assumptions

- `npm audit` and `npm audit --prefix backend` reported zero known vulnerabilities during this review. No dependency or lockfile changes were made. Existing package metadata showed minor newer releases and transitive deprecation notices; no advisory justified a compatibility-changing update.
- `TRUST_PROXY` is applied to Express and determines the client address seen by IP-keyed throttles. Production must configure the exact trusted proxy topology; trusting arbitrary forwarding headers would let a caller rotate the apparent source IP.
- The application middleware reviewed here does not emit HSTS. The project relies on an external TLS/edge layer, which was not inspected. Verify HSTS, TLS redirect, trusted proxy ranges, request-size limits, and egress policy against the actual deployment before treating this report as production infrastructure proof.
- DNS-rebinding behavior, production environment secrets, CDN cache rules, and deployed session behavior were not live-tested.

## 9. Verification evidence

Commands ran in the assigned task worktree unless the row names the shared integration worktree. Results:

| Command | Result |
| --- | --- |
| `rtk npm run build:catalog` | Passed; generated catalogue reports 752 shows, 54 collections, and 7 review companions. |
| `rtk npm run build:pages` | Passed; generated page and service-worker outputs. |
| `rtk proxy npm --prefix backend run test:maintainer-auth` | Passed; captured-cookie logout replay receives 401. |
| `rtk proxy npm --prefix backend run test:security` | Passed after integration rebase, 43/43 focused tests. |
| `rtk proxy npm --prefix backend run test:security:browser` | Passed, 1/1 targeted service-worker cache-policy browser test. |
| `rtk proxy npm --prefix backend run test:library:product` | Passed, 4/4 private Library product tests. |
| `rtk npm audit` | Passed; zero vulnerabilities reported. |
| `rtk npm audit --prefix backend` | Passed; zero vulnerabilities reported. |
| `rtk proxy npm run verify` (task branch after rebase, before merge) | Passed, exit 0. The serial backend suite reported 450/450 passing, and every required Chromium smoke batch reported zero failures and zero skips. Catalogue/page builds, structure, generated-output, release-artifact, tooling, and determinism gates also passed. This validated the same source tree later fast-forwarded into integration. |
| `rtk proxy npm run verify` (shared integration worktree after fast-forward) | Did not pass. `test:serial` again reported 450/450 passing. In `test:smoke:required`, `test/mobile-launch.smoke.js` was cancelled with `Promise resolution is still pending but the event loop has already resolved`; its child returned exit 143. The smoke runner continued into later files, but the command session detached before a final aggregate was captured. Source inspection found no direct signal/kill path in that test. Since the same tree had passed the complete required browser run immediately before integration, this is recorded as one unexplained browser-runner interruption; the full suite was not looped to force a green result. |
| `npm run test:tools` within full verification | 149 passed, 5 skipped with explicit environment reasons: two Linux production-host fixtures and three tests requiring Restic, unavailable on the macOS host. |
| `rtk git diff --check` | Passed before documentation/commit. |

`check:structure` emitted its existing soft-limit warnings for source and cover-file sizes; it did not fail. Earlier incomplete route sweeps before generated-page setup and non-dot static-root aliases were corrected were test-harness setup failures, not product failures, and were superseded by the successful focused and full verification above. The dot-prefixed assigned worktree path caused Express `sendFile`/`send` to reject fixtures because a parent path component began with a dot; test servers use temporary non-dot symlink aliases. The incoming disaster-recovery campaign added the equivalent `visible-static-root` helper before this branch integrated, so the rebased task reuses that helper rather than carrying a duplicate. This workaround is test-only and does not change app routing. The integrated full-run interruption is left as an unresolved verification limitation pending a later diagnostic run under the protocol's retry guidance; focused security, targeted browser, and Library privacy checks all passed after fast-forward integration.

## 10. Files, integration record, and reconciler notes

The task changes are limited to the following implementation, regression-test, generated-worker, and QA files:

- `backend/lib/maintainer-auth.js`
- `backend/lib/services/community-service.js`
- `backend/lib/services/published-listener-review-service.js`
- `backend/lib/store/collection-store.js`
- `backend/lib/store/database.js`
- `backend/lib/store/published-listener-review-store.js`
- `backend/package.json`
- `backend/server.js`
- `backend/test/browser.smoke.js`
- `backend/test/collection-service.test.js`
- `backend/test/community-routes.test.js`
- `backend/test/community.test.js`
- `backend/test/helpers/browser-smoke.js`
- `backend/test/listener-library-product.smoke.js`
- `backend/test/maintainer.test.js`
- `backend/test/public-routes.test.js`
- `backend/test/published-listener-review.test.js`
- `backend/test/rate-limit.test.js`
- `sw.js` (generated)
- `tools/build-pages.js`
- `docs/qa/SECURITY-INVARIANTS.md`
- `docs/qa/2026-09-30-security-redteam.md`

The protocol handoff at `docs/qa/agent-handoffs/security-redteam.md` records the implementation commit, final task branch head, integration lock/rebase state, pre-integration commit, combined verification, final overnight integration commit, and push results. The shared overnight branch must remain separate from `main`; the eventual main reconciler should carry the invariant document and report, preserve the database-backed logout revocation/rate-limit/service-worker/JSON fixes, and decide how to close the importer connection-time pinning gap. No publishing, deployment, production write, or main-branch operation was performed.
