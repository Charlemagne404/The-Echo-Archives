# The Echo Archives — Stability & Maintenance Audit

**Assessment date:** 2026-11-24

**Readiness:** **RED — not suitable for three to six months of unattended operation**

**Post-deployment update (2026-11-25):** This audit remains a historical snapshot of the 2026-11-24 host state. Consolidated candidate `092faa604982ffd229fe0686157c4d275818e303` has since been deployed to production and staging; both are reported healthy. Production retains 760 shows and 54 collections, Discord notifications have zero pending or failed deliveries, and manual visual inspection found no apparent regressions. The unattended-recovery and monitoring concerns below remain separate infrastructure follow-ups; see [`STABILITY_REMEDIATION.md`](STABILITY_REMEDIATION.md) for the closeout status.

## Executive summary

The deployed application is serving successfully and its current release passes the full project verification suite. The database reports WAL mode with FULL synchronous durability, the daily local backup passed SQLite integrity and foreign-key checks, production and staging services are active, and bounded live requests returned expected responses.

Unattended readiness is blocked by host capacity and recovery weaknesses: the root filesystem is 96% full, the five-minute local monitor is failing on that threshold, all 4 GiB of swap is consumed, and the offsite-backup timer is inactive. In addition, the deployed dependency lockfile has one critical and three high-severity npm audit findings (eight total including three moderate and one low). A compatible lockfile-only fix is committed on a separate branch and passes verification, but it is not deployed. These are material operational and security risks, so a passing application test suite is not enough to classify this host GREEN.

## Scope and evidence boundary

This assessment used the running production and staging services, their deployment metadata and health endpoints, systemd state and recent journals, filesystem and process metrics, backup-monitor output, Cloudflare zone settings/rulesets, the exact deployed source revision, the repository and GitHub CI history, and the project's documented verification commands. Production checks were limited to a small set of GET requests; no reviews, submissions, ratings, analytics events, or other user activity were created.

The deployed revision was `55e761be2dc3c9afa2b1572e98be954140042edd` (built 2026-11-14). Automated browser smoke coverage ran against an isolated checkout of that exact revision. Direct visual inspection of a live browser session was unavailable because the computer-use browser host could not be reached. No production deployment, database write, restore drill, or offsite backup run was performed.

## Verified system health

### Production and staging

- `echo-archives.service`, `echo-archives-staging.service`, and `caddy.service` were active. Both application services reported zero restarts in the inspected service state.
- Production and staging both ran revision `55e761be2dc3c9afa2b1572e98be954140042edd`. Production health reported 760 shows and 54 collections; staging reported 752 shows and 54 collections.
- Production's built-in health response reported SQLite WAL mode and `synchronous=FULL`. The production database was updated during the audit window. Production's Discord dispatcher was enabled and running with zero pending and zero failed notifications; 17 deliveries were recorded. Staging Discord notifications were disabled as expected.
- Recent production application error-priority journal output was empty. The local monitor did not pass: after certificate and backup checks, it failed with `Production filesystem usage is 96%`.
- Bounded public GETs returned 200 for the home page, `/api/health`, `/api/popularity/scores`, `/creators`, `/shows/derelict`, `/collections/best-for-long-walks`, show and collection JSON feeds, `/sitemap.xml`, `/robots.txt`, and `/sw.js`. The `www` host redirected to the canonical host. The unauthenticated maintainer analytics endpoint returned 401.
- Responses included HSTS, a restrictive Content Security Policy, `X-Frame-Options: DENY`, and `X-Content-Type-Options: nosniff`. Cloudflare showed HTTPS enforcement, TLS minimum 1.2, browser checks, managed free firewall and L7 DDoS rules, plus cache rules for public pages/data and a service-worker bypass. Bot Fight Mode was not confirmed, and no custom rate-limit ruleset entrypoint was surfaced in the read-only API inspection.

### Database and backups

- The daily local database backup timer was active and its latest run succeeded. The local monitor validated a 127,385,600-byte backup with SQLite `integrity_check=ok`, zero foreign-key violations, 760 podcast rows, and expected supporting-table counts.
- The backup is on the same host. The offsite backup timer and service were inactive, and no restore test was available. Integrity validation is useful evidence, but it does not demonstrate recovery from host or filesystem loss.
- The database and backup data were not read or changed directly during this audit.

### Code and application behavior

- Exact deployed revision: clean locked install and `npm run verify` passed. This covered catalog/page builds, generated-file checks, deterministic build output, 193 tool tests, 560 serial backend tests, 113 browser smoke tests, catalog/data validation, and release-route sanity. Data validation reported 752 shows, 54 collections, and zero errors. It also reported entity/role attribution warnings that need editorial review rather than automatic changes.
- The browser suite covers discovery/search, show and creator pages, responsive layouts, history, submissions, reviews, admin views, analytics behavior, and library interactions. Those checks passed on the isolated deployed revision; they do not substitute for physical-device or live production console inspection.
- The dirty shared checkout's focused checks also passed: 104 tool tests, 460 backend tests, config validation, data validation, and `git diff --check`. That checkout contains unpublished importer/publisher work and is not the deployed release; it was not built or fully verified as a whole to avoid overwriting shared generated output.
- The package scripts provide a comprehensive `verify` command but no separate lint or type-check script. `check:structure` emits non-blocking size warnings for several long modules and large cover-art files. No confirmed runtime bug, data corruption, or functional regression was found in the verified release.

### Security controls reviewed

- Maintainer endpoints use a required, signed, database-backed session. Session IDs are random, signature comparison is constant-time, cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS. The live unauthenticated maintainer request returned 401.
- Community ratings and submissions apply input validation and rate limits; ratings also use Turnstile verification. The server caps JSON bodies at 24 KiB, rejects oversized URLs and excessive query parameters, and defines CSP, HSTS, frame, and MIME-sniffing protections. Dynamic HTML rendering uses escaping in the inspected show-page renderer.
- Production and staging services run as the dedicated `echo-archives` user with systemd `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ProtectHome=read-only`, an empty capability bounding set, and restart-on-failure. The production environment file is root-owned and mode 0600; its contents were not read.
- No additional confirmed SQL injection, XSS, CSRF, authentication bypass, or accidental secret exposure issue was identified from the exercised routes, inspected controls, and project tests. This was not a third-party penetration test or exhaustive proof of absence; the dependency advisories above are confirmed and remain the principal known security issue.

### Host and operations

- At inspection, the root filesystem was 468 GiB total, 425 GiB used, 19 GiB free (96%). The local monitor is configured to fail above 80% usage and below its free-space floor. Its five-minute timer remains active, but its service result is failed.
- Swap was 4 GiB total and effectively full. Available RAM was approximately 2.7–3.0 GiB of 15 GiB. Production and staging application memory were approximately 266 MiB and 124 MiB at inspection, with observed peaks near 522 MiB and 455 MiB respectively. These application measurements are moderate; host storage and swap are the immediate capacity concerns.
- The deployment tree held about 19 GiB of releases and 18 GiB of runtime snapshots. Journal storage was about 209 MiB against documented bounds of 256 MiB and 14 days. The active services listen on loopback behind Caddy.
- The daily discovery timer was active and reported no due sources on its last check; a prior run processed two sources without failure. Certificate checks passed during the latest monitor run.

## Findings by severity

### Critical

1. **Production dependency advisories remain live.** `npm audit` against the deployed revision's lockfile found eight advisories: one critical (`proxy-addr` IP-spoofing issue), three high, three moderate, and one low. The high findings affect the installed `body-parser`, `fast-xml-parser`, `sharp`, and `undici` dependency paths. A patched lockfile is verified and committed on `codex/echo-stability-audit-20261124`; it has not been deployed. Until it is promoted through the normal release process, production remains exposed to known dependency flaws.

### High

2. **Capacity monitor is failing at 96% filesystem use.** The active five-minute monitor repeatedly fails after checking backups. The host has 19 GiB free, but sits 16 percentage points above its configured usage limit. This leaves limited room for logs, database growth, image/cache work, backups, and safe deployment/rollback artifacts.
3. **Offsite recovery is not active or proven.** The offsite timer is inactive. The on-host backup passed integrity checks, but there is no verified off-host copy or restore drill. Host or disk loss could therefore take out both the service and its only verified backup.
4. **Automated release cleanup cannot fully reclaim protected snapshots.** A retention cleanup reclaimed roughly 2 GiB from an eligible old release/runtime snapshot, then stopped with permission errors on protected production runtime subdirectories owned by another service account. Current production/staging pointers, databases, and the previous production release remained intact, and both services stayed healthy. The cleanup did not bring disk usage below threshold. Do not bypass these ownership boundaries; the owning account or administrator must review and complete cleanup.
5. **Swap is exhausted.** All 4 GiB of swap was occupied, with measurable memory and I/O pressure. The application was responsive during checks, but this reduces resilience to workload spikes and increases risk of slowdowns or OOM events.

### Medium

6. **Source and production release history are not consolidated.** The deployed revision is on a remote mitigation branch with successful CI, but is not merged to `main` and has no open pull request. The shared checkout's `main` is 83 commits behind `origin/main` and contains approximately 48 modified tracked files plus 9 untracked files of importer/publisher work. Those changes were preserved and not staged or overwritten. This makes it harder to identify the authoritative release source and safely reproduce production.
7. **Data attribution warnings need human review.** Validation had zero blocking errors but emitted entity-role mismatch and multiple-role warnings. No factual metadata was changed because the correct attribution needs editorial confirmation.
8. **Cloudflare bot configuration is only partly evidenced.** Managed firewall/DDoS protections, browser checks, and application-level abuse controls are present, but Bot Fight Mode and custom rate limiting could not be confirmed from the available zone API view. This is an evidence gap, not proof that those protections are absent.

## Remediation performed

- Updated vulnerable transitive versions in `backend/package.json` overrides and `backend/package-lock.json` on an isolated branch: `proxy-addr` 2.0.8, `qs` 6.17.0, `undici` 7.30.1, `body-parser` 2.4.0, `fast-xml-parser` 5.12.1, and `sharp` 0.35.5 (with compatible Express 5.3.0). No dependency was added.
- The patched branch installed with `npm ci`, passed the full `npm run verify` suite, and `npm audit --audit-level=high` reported zero vulnerabilities.
- Ran the deployment's retention cleanup with its documented apply mode after verifying the current release, previous production rollback release, and latest local backup. It freed about 2 GiB before an ownership permission error stopped the remaining cleanup. Rechecked the live pointers, production and staging health, and active service state afterward; they remained unchanged and healthy.
- No production or staging deployment, service restart, database mutation, permission change, privilege escalation, history rewrite, or change to the shared dirty checkout was performed.

## Repository and CI status

- Existing remote: `origin` at the Echo Archives GitHub repository. Latest CI for deployed SHA `55e761be2dc3c9afa2b1572e98be954140042edd` succeeded on 2026-11-14. Recent `main` CI also succeeded. No open GitHub issues or pull requests were found.
- The security fix and this report are committed on a new branch based on the deployed revision. The branch is pushed for CI/review; it is not merged and does not change production.
- GitHub Actions `Verify` passed on implementation commit `ada52100ca2e6fb1c8b53e8d0f44b268adeea291` in 13m06s, including the full generated-site/browser suite and clean-checkout check. The workflow emitted a non-blocking Node.js 20 deprecation warning: `actions/checkout@v4` and `actions/setup-node@v4` were forced to run on Node.js 24.
- No history was rewritten, branches deleted, or unrelated work staged. The dirty shared checkout remains untouched and is not clean or synchronized with `origin/main`.
- A fresh locked install/build was verified on the deployed revision and on the patched candidate branch. The existing checkout's unpublished WIP was not represented as a reproducible release.

## Remaining actions and release gate

Administrator or owning-account work is needed to:

1. Reclaim or expand storage safely, repair the retention cleanup ownership/preflight issue, and return below the configured 80% threshold with deployment/rollback headroom.
2. Investigate full swap and memory pressure, then verify stable headroom under normal scheduled tasks.
3. Enable a suitable offsite backup path and perform a documented restore rehearsal before relying on it.
4. Review and promote the verified dependency patch through staging and the normal production approval/deployment path. Production still runs the vulnerable lockfile until then.
5. Reconcile deployed `55e761...`, remote `main`, and the preserved local importer/publisher WIP through an explicit review/merge plan. Do not discard or reset that work.
6. Confirm Cloudflare bot/rate-limit settings in the account dashboard/API and review the entity-role validation warnings.

No production deployment was performed in this audit. The verified local backup and previous release provide a rollback basis for a future release, but storage pressure and the lack of offsite recovery should be addressed before routine unattended operation is declared safe.

## Recommended maintenance cadence

- Keep daily automated local backup, database integrity, certificate, service, and capacity checks. Alert on monitor failure rather than relying only on journal inspection.
- Review free disk, swap, backup freshness, and failed systemd jobs weekly until stable headroom is restored; then review monthly.
- Review dependency advisories and GitHub CI monthly and after significant dependency or runtime changes.
- Perform a documented restore and rollback rehearsal at least quarterly and after changes to database backup/deployment procedures.
- Review discovery jobs and catalog/data-quality warnings monthly; make factual data changes only with supporting evidence.
