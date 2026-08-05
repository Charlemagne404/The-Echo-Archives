# Launch-Readiness Audit — 2026-07-28

## Working status

- **Verdict:** Not ready
- **Audit date:** July 28, 2026
- **Production URL:** `https://echoarchives.net`
- **Repository:** `/home/charlie/The-Echo-Archives`
- **Audit basis:** Current repository, live website, production configuration, running services, database, logs, DNS, TLS, network state, backups, and hosting machine
- **Last updated:** August 5, 2026

This is the working launch-readiness record for resolving the issues discovered during the July 28 audit. Update item status and add verification evidence as fixes land. Do not mark the site launch-ready until every blocker is closed or explicitly accepted by the owner with a documented mitigation.

Suggested status values:

- `Open`
- `In progress`
- `Ready for verification`
- `Verified`
- `Accepted risk`
- `Not applicable`

## Executive summary

The public site is online, fast, crawlable, and backed by a generally solid
application foundation. The code defects that produced false `0/10` ratings
and contradictory browse results are fixed. The Cloudflare origin gate, Caddy
2.11.4, dedicated runtime account, hardened Echo unit, production feature
flags, access telemetry, and WAL/`synchronous=FULL` are now active and passed
their corresponding live maintenance stages. Launch remains blocked by the
still-stale off-site backup, Ollama 0.6.7, unconfigured/proven external alerts,
external two-network rate-limit evidence, and the remaining restore and
rollback drills.

There are additional high-priority security, recovery, legal, accessibility, data-quality, and operational issues that should be addressed before launch.

### Remediation progress — July 28, 2026

Production was re-inspected before remediation. The installed/live versions and
the six launch-blocker effects still matched the audit: Node `22.23.1`, Caddy
`2.10.2`, Ollama `0.6.7`, false `0/10` output, visible hidden empty state,
Cloudflare proxy identities, direct-origin HTTP 200, dirty deployment checkout,
and no proven external alert delivery.

Repository remediation has since:

- corrected null ratings in generated/server and client renderers;
- fixed all browse empty-state variants and added desktop/mobile browser tests;
- prepared a current-Cloudflare peer gate, strict proxy parsing, spoof-resistant
  upstream IP header, range-maintenance check, and full shared-host candidate;
- classified importer staging as durable private state, preserved all 58 files,
  ignored the directory, and removed only ten accidentally tracked copies from
  Git's index;
- replaced the stale root deployment script with a compatibility wrapper and
  changed the canonical deployment to disposable-candidate validation with
  previous-revision/dependency rollback and no database rollback;
- prepared Better Stack HTTP monitors and a success/failure backup heartbeat;
- expanded encrypted backup scope, selected the marker-pinned last successful
  snapshot for restore,
  added an isolated restored-app test, and added off-site-gated 30-day local
  retention;
- aligned CI/runtime Node requirements, consolidated feature flags, deferred
  passive community-profile creation, fixed submission ARIA, repaired the
  audit's confirmed links, and added a bounded opt-in external-link checker;
- changed SQLite to `synchronous=FULL` after temporary representative-write
  benchmarks;
- added weekly keyed IP pseudonyms and body/header/query-free request telemetry;
- corrected controller, contact, jurisdiction, minors, and storage disclosures;
- prepared a guarded dedicated `echo-archives` runtime-account migration with
  targeted ACLs, `/var/lib` database state, compatible systemd isolation,
  14-day namespaced journal retention, verification, and rollback;
- repaired the additional eleven confirmed link failures found by the first
  remediation scan, then removed the still-failing Storage Papers website;
- created and integrity-checked a fresh local online backup, restored a copy
  into a temporary directory, started an isolated loopback-only application,
  verified health/catalog/detail reads, and removed the process and directory.

The July 31 maintenance runs have now reloaded Caddy, upgraded it to 2.11.4,
installed the Cloudflare-only origin gate, migrated Echo to the dedicated
`echo-archives` account, applied its hardened/namespaced systemd configuration,
and restarted the application. No firewall rule, DNS, Cloudflare account, or
unrelated hosted-service configuration was changed. Direct loopback origin and
header-spoof checks passed inside the origin-gate stage. External second-network
and account-side checks remain open.

The reviewed remediation commit
`3eec7daeaf4f4b72674a8fa77dd72f6f2944bc22` was pushed to `origin/main`.
GitHub Actions Verify run `30364199822` completed successfully, including the
full repository verification and stale-generated-output gate.

Follow-up repository preparation adds a single controlled privileged
orchestrator and runbook:

- `deploy/complete-launch-maintenance.sh`
- `deploy/COMPLETE_LAUNCH_MAINTENANCE.md`
- `deploy/verify-deployment-rollback-invariants.sh`

The orchestrator requires the exact clean `origin/main` commit, validates all
prerequisites before mutation, creates a fresh verified backup, separates the
Caddy origin change/Caddy upgrade/runtime migration/backup restore/Ollama
upgrade into fail-fast stages, preserves exact rollback inputs, automatically
rolls back only the current stage, and concludes with local/public,
origin/spoof, TLS, shared-host, firewall-read, service, and log checks. It
installs the Better Stack integration only when the root-owned secret file is
already present and valid. The newest Restic restore, Ollama, rollback, and
final live-production stages remain unverified.

Follow-up review also made the encrypted recovery inventory fail closed on
symlinked importer/configuration state, added every runtime-writable
publication path, verifies the complete staged-path manifest against the newly
created remote snapshot, gives the protected backup service its exact
retention write path, and restores backup unit/timer state during current-stage
rollback without claiming stale freshness was repaired. The canonical deploy
now grants the runtime account access to candidate dependencies, verifies
module resolution before restart, and retains the previous dependency tree
until semantic health validation succeeds.

Official upgrade and fallback artifacts were downloaded outside the repository
into the private rollback directory. Caddy 2.11.4 and 2.10.2 matched their
official SHA-512 manifests; Ollama 0.32.5 and 0.6.7 matched their official
SHA-256 manifests. The staged Caddy 2.11.4 binary and archive contents were
validated before the maintenance window.

The first exact-commit repository-check run correctly stopped before privileged
work when strict `pipefail` exposed an early-exit archive-listing assertion.
The validator now consumes the complete Ollama listing while checking both
`bin/ollama` and `lib/ollama/`; the archive itself and its official checksum
were unchanged. The successful rerun is recorded with the follow-up commit.
A final safety review found the same early-consumer risk in the public-homepage
checks used by the privileged orchestrator and runtime-account migration. Both
checks now download the complete response before inspecting it, so a successful
large response cannot be mistaken for a network failure under `pipefail`.
Regression assertions cover both call sites.

The first privileged preflight on July 29 stopped before mutation because the
new off-site backup script's retention write probe had run under the still-live
older systemd sandbox, which made the backup directory read-only. The local
monitor then failed because it correctly observed that failed unit. The
orchestrator now permits only this exact allowlisted transition after matching
both journal signatures, preserves and validates the unit change after the
fresh database backup, and clears the two failure states only after the new
application health contract passes. Unrelated failed units remain fatal. At
that point this transition was ready for another privileged preflight but was
not yet production-verified.

The resumed July 31 apply at
`765437d77b3906b500b1b5d9b6cc4489a46edcd0` completed preservation, a new
100,204,544-byte integrity/foreign-key-checked database backup, the backup-unit
transition, the corrected Caddy origin gate, the Caddy 2.11.4 upgrade, and the
runtime-account migration. The live application then passed local and public
health with 100 shows, 29 collections, ratings/maintainer review/access logs
enabled, WAL, and `synchronous=FULL`; it runs as `echo-archives` and binds only
to loopback. The run stopped before Better Stack, Restic restore/backup, Ollama,
firewall/storage evidence, rollback, and final verification because the
live-application stage incorrectly started the local monitor before the later
backup stage could replace its 88-hour-old off-site success marker.

That sequencing defect is now covered by a regression: preflight classifies
only the current systemd invocation, accepts this exact resumed-run stale-marker
state only after the corrected backup unit is installed, performs the
backup-independent application checks, and defers the monitor freshness gate
to the Restic stage. The Restic stage must publish a fresh success marker,
start the monitor successfully, and leave zero failed units. A failed Restic
stage restores its unit/timer state without pretending that the pre-existing
stale marker was repaired. This repository fix is not production-verified
until a new privileged run reaches and passes that stage.

The next July 31 apply at
`f3b6cf6a2174225a3289e576be5ea946a4e00b5f` passed every stage through the
live application and Better Stack heartbeat stage, then stopped inside
off-site recovery inventory staging. Systemd evidence shows the job validated
the new 100,204,544-byte local database backup and staged importer data, but
exited before sending a Restic snapshot. The current-stage rollback restored
the backup unit/timer state, resumed both timers, and initially left no failed
unit. The local timer subsequently reasserted the truthful stale-marker
failure; the off-site freshness marker remains stale and Ollama was not
upgraded.

The cause was an absent optional configuration path executing bare `return`
after a failed `[[ -e ... ]]` test. Under `set -e` that returned status 1 and
silently terminated the job. The branch now logs the absent configuration and
returns 0 explicitly, while a new ERR trap records line and status for any
future unwrapped failure. Regression tests also prove a stale marker remains a
recognized resumable state after successful rollback clears systemd's failed
unit flag. The off-site restore/backup remains unverified until the corrected
job completes in production.

The corrected apply at
`908747d687e81a770df4f13d07ad780e75bcaf7e` again passed preservation, fresh
database backup, backup-unit reconciliation, the origin gate, Caddy, runtime
account, live application, and Better Stack stages. At 21:12 it successfully
uploaded a new encrypted Restic snapshot, listed that exact snapshot, and then
stopped because the remote-inventory verifier treated all 516 staged paths as
missing. The hard-coded parser only recognized paths containing the literal
substring `/recovery/`; production Restic emitted a different valid path form.
Retention, `restic check`, local pruning, readiness, and the freshness marker
did not run. Current-stage rollback restored the timer/unit state and cleaned
visible temporary files. The immutable uploaded snapshot was correctly left in
the repository for the next reviewed retention run. The freshness marker
therefore remains stale and Ollama remains 0.6.7.

The first replacement preflight at
`43f68465f0160770cf5ba52b2f42736260053fca` stopped without changing production
at 23:22. It selected the newest tagged snapshot and then could not find the
expected root manifest. That snapshot was the unverified orphan committed by
the failed 21:12 job; it was created after the still-current 04:08 success
marker and never passed inventory, retention, repository-integrity, cleanup, or
marker publication. Treating "newest tagged" as "last successful" was therefore
incorrect. The protected check log is
`/var/log/echo-archives/complete-launch-maintenance-20260731T212151Z.log`.

The corrected protocol now anchors restore selection to successful evidence.
The transitional one-line marker selects the newest exact-host/tag snapshot no
later than its completion time, excluding every newer failed-run orphan. Future
atomic markers record both completion time and the full successful snapshot ID
and are published only after all backup checks and cleanup pass. Both preflight
and the backup job use `restic restore --verify` in guarded root-only staging,
then compare the exact restored filesystem with `REQUIRED_PATHS`. The verifier
rejects missing/extra/duplicate/unsafe paths, nested manifests, symlinks,
invalid UTF-8, unsupported entries, and non-canonical roots while reporting
counts rather than private filenames. A real disposable Restic backup and
verified restore exercises this exact flow. Production-only status remains
Ready for verification until the new privileged check/apply succeeds.

The scheduled off-site jobs on August 4 and 5 exposed a separate Restic source
topology defect. Invocation `b9d338e782ce43fb911df139d1e1fe65`
successfully selected and verified
`community-2026-08-05T01-29-42-022Z.sqlite` (101,560,320 bytes, integrity
`ok`, zero foreign-key violations, 129 podcasts, 31 profiles, 130 import
candidates, and two discovery sources), staged the expanded inventory, and
created snapshot `4b7423fd`. Restic then restored only four ancestor
directories and zero bytes and verified zero files, so the inventory verifier
failed and no success marker, retention, local pruning, or success heartbeat
was published. Snapshot `2c4daaef` from August 4 has the same failed-run
pattern. Both remain unpinned orphan snapshots and are not recovery evidence.

The cause is deterministic Restic 0.16.4 behavior: it always excludes paths
beneath its active `RESTIC_CACHE_DIR`, independently of `--exclude-caches`.
The job had incorrectly placed its backup source under that cache. The prepared
correction puts both protected recovery staging and restore scratch space in
the already sandbox-writable systemd state directory, rejects overlapping
state/cache realpaths, requires the backup summary to include files and at
least the staged database bytes, validates exact host/tag/source snapshot
metadata, and restores the exact recovery subfolder before manifest
verification. A disposable real-Restic regression reproduces the zero-byte
cache-nested failure and proves the separated topology restores every staged
path. Preflight now accepts only the complete current-invocation signature of
this known failure so the corrected job can replace it; unrelated failed units
remain fatal. This correction is repository-tested but remains **Ready for
verification**, and the July 28 success marker remains stale until a production
job passes completely.

Because repeated runs had exposed production-only assumptions one at a time,
the maintenance safety review was expanded across every remaining stage. The
prepared script now copies and re-hashes artifacts into root-owned per-run
staging, fully extracts Ollama during privileged preflight, polls Ollama server
and API readiness, keeps rollback armed through both isolated Echo integration
paths, fully verifies an Ollama rollback, pauses backup automation
before Restic work, requires new backup/monitor invocation IDs, handles
`INT`/`TERM`/`HUP`, prevents conditional `errexit` from masking rollback
failures, enforces loopback binds for all isolated processes, explicitly
deletes and verifies removal of unencrypted recovery/rollback copies, selects
the last successful snapshot by its atomic marker, checks TLS 1.2/1.3,
correlates the final public
access event by request ID, and requires a safe fresh off-site marker in final
verification. The privileged `--check` now exercises every non-destructive
production check used by the remaining stages, including current Ollama and
Archivist flows, UFW/nftables, SMART, and the disposable rollback invariant.
None of these production-only gates is `Verified` until the corresponding
privileged check/apply evidence passes.

### Repository verification evidence

The August 5 post-fix `npm run verify` completed successfully:

- generated 129 shows, 29 collections, and seven review companions;
- structure and local-link validation passed;
- operations/tool tests: `52/52`, including the real Restic cache-topology
  failure reproduction, separated staging restore, and exact transition checks;
- backend tests: `231/231`;
- Chromium browser smoke tests: `60/60`, including generated/raw HTML, client-rendered
  null ratings, desktop/mobile browse states, submission accessibility, passive
  profile behavior, and repaired start-link navigation;
- Firefox serial browser smoke tests: `60/60`;
- WebKit serial browser smoke tests: `60/60`, after making readiness and
  transition assertions observe client state instead of fixed timing windows;
- production configuration check passed with ratings, maintainer review, and
  access observability configured in the private environment;
- `npm audit --omit=dev` reported zero vulnerabilities;
- `git diff --check`, shell parsing, and offline systemd verification passed.

The resumed-maintenance regression initially exposed two checkout-path
assumptions only in GitHub's `/home/runner` workspace. The fixture now keeps the
fixed production root assertion while independently locating its checked-in
candidate. GitHub Actions Verify run `30656424109` passed for
`c9c8d7b7156c28519120a957a233f4804cf0863a`, including the complete repository
suite and stale-generated-output gate.

The opt-in real-network external-link scan ended with 395 healthy destinations,
zero confirmed HTTP failures, four TLS failures, twelve provider bot blocks,
and one inconclusive response. The non-healthy uncertain destinations remain
manual follow-up; they are not reported as verified.

The initial Caddy candidate passed syntax validation with installed Caddy
`2.10.2` and staged Caddy `2.11.4`, but its adapted handler order placed the
unconditional proxy before the separate abort. The first July 31 apply detected
that direct loopback access still succeeded, stopped at the origin-gate stage,
and restored and reloaded the exact original Caddyfile. After that first
attempt, Caddy remained `2.10.2` and the origin gate remained unapplied. The
corrected snippet keeps abort and proxy/redirect inside one literal-order
route. A new validator inspects adapted JSON and rejects the original ordering;
the regenerated private candidate passes with both Caddy versions. Its 22
Cloudflare ranges still match the official lists, and both packages retain
their reviewed SHA-512 values.

That apply completed only preservation, a new 100,204,544-byte verified local
database backup, and the reviewed off-site systemd write-path reconciliation
before the Caddy failure. No Caddy upgrade, runtime-account migration, Echo
restart, Restic restore, Ollama upgrade, or later stage ran. The backup and
systemd reconciliation remain completed; the Caddy stage rollback passed.

The fresh local backup was 99,332,096 bytes with SQLite integrity `ok`, zero
foreign-key violations, 100 podcasts, 27 profiles, 126 import candidates, and
two discovery sources. The isolated recovery check returned healthy with 100
catalog shows and 29 collections; Marsfall rendered `Unrated` without `0/10`.
This is useful local recovery evidence, but it is not the still-required newest
off-host Restic restore.

### Changed-file inventory

Core application and regression work:

- `backend/lib/{show-page-render,config,access-observability}.js`,
  `backend/lib/store/database.js`, `backend/server.js`,
  `backend/scripts/{check-external-links,configure-access-observability}.js`,
  and the related backend unit/smoke tests;
- `shared/app/{utils,community/*,render-cards/*,render-show/*}.js`,
  `shared/app/submit/render/{base-fields,link-fields}.js`, and
  `shared/styles/home/cards/16-empty-tablet.css`;
- `catalog-src/shows/*.json` for the repaired destinations, generated
  `data/shows.json`, `home.css`, `style.css`, `script.js`, `sw.js`, and the
  generated public HTML pages/clean-route aliases.

Deployment, recovery, and monitoring work:

- `deploy/{Caddyfile.echo,Caddyfile.global.echo,CADDY_ORIGIN_RUNBOOK.md}`,
  `deploy/{prepare-caddy-origin-candidate,check-cloudflare-proxy-ranges}.sh`,
  and `deploy/validate-caddy-origin-semantics.js`;
- `deploy/{echo-archives.service,echo-archives-journald.conf}`,
  `deploy/migrate-echo-archives-runtime-account.sh`,
  `deploy/install-echo-archives-system.sh`;
- `deploy/{update-echo-archives.sh,ROLLBACK_PLAN.md}` and the root
  `update-echo-archives.sh` compatibility wrapper;
- `deploy/{echo-archives-offsite-backup.sh,echo-archives-offsite-backup.service,
  echo-archives-offsite-backup.timer,verify-restored-application.sh,
  complete-pi-backup-setup.sh}`,
  `tools/verify-restic-recovery-inventory.js`,
  `tools/select-restic-success-snapshot.js`, and their Restic regression tests;
- `deploy/{BETTER_STACK_SETUP.md,better-stack-account.env.example,
  better-stack-heartbeat.env.example,notify-better-stack-heartbeat.js,
  echo-archives-offsite-backup-heartbeat.conf}`;
- `deploy/{COMPONENT_UPGRADE_RUNBOOK.md,MONITORING_PLAN.md,
  OFF_HOST_BACKUP_PLAN.md}` and corresponding `tools/test/*.test.js` files.
- `deploy/{complete-launch-maintenance.sh,COMPLETE_LAUNCH_MAINTENANCE.md,
  verify-deployment-rollback-invariants.sh}` and
  `tools/test/complete-launch-maintenance.test.js`.

Configuration/documentation work:

- `.github/workflows/verify.yml`, `.gitignore`, root/backend package manifests
  and locks, `backend/.env.example`, `deploy/monitoring.env.example`;
- `docs/{ARCHITECTURE.md,IMPORTER.md,OPERATIONS.md}`, `data/schema.md`,
  `site-src/pages/{privacy,cookies}.html`, and their generated pages;
- `tools/{backup-database.js,prune-local-backups.js,run-backend.js}`.

## Launch blockers

### BLOCKER-01 — Unrated shows are presented as `0/10`

- **Status:** Verified
- **Area:** Editorial trust, show pages, SEO
- **Severity:** Launch blocker

#### Finding

Seventy-three of the 100 catalog shows have `finalRating: null`. The show-page rendering code tests:

```js
Number.isFinite(Number(show.finalRating))
```

Because `Number(null) === 0`, null ratings are treated as valid zero ratings.

#### Live effect

Unrated detail pages display:

- `Archive rating 0/10`
- `Echo score`

Marsfall and Limetown were confirmed examples. Google and Bing snippets have already reproduced false `0/10` ratings, so this is not confined to the application UI.

#### Evidence

- `data/shows.json`: 100 published shows, 27 numeric ratings, 73 null ratings
- `backend/lib/show-page-render.js:204`
- `shared/app/render-show/hero.js:27`
- `shared/app/render-show/sections.js:43`

#### Required fix

- Treat only actual numeric ratings as rated.
- Ensure `null`, `undefined`, blank, and non-numeric values render as `Unrated`.
- Fix both generated/server output and client rendering.
- Regenerate affected pages.
- Add regression coverage for null ratings.
- Request search-engine recrawling after the corrected pages are deployed.

#### Verification

- [x] An unrated show says `Unrated` in generated HTML.
- [x] An unrated show says `Unrated` after client rendering.
- [x] An unrated show never emits `0/10` or `Echo score`.
- [x] A genuinely rated show still renders its exact rating.
- [ ] Search-engine snippets no longer show false zero ratings after recrawl.

### BLOCKER-02 — Browse results display the no-results panel

- **Status:** Verified
- **Area:** Core discovery, homepage
- **Severity:** Launch blocker

#### Finding

A live search for `space station` returned eight shows and an `8 results` summary, but the `No matches yet` panel was still visibly rendered.

JavaScript correctly sets the element's hidden state, but the author CSS rule overrides the browser's hidden styling:

```css
.empty-state-card {
  display: grid;
}
```

#### Evidence

- `site-src/pages/index.html:222`
- `shared/app/pages/home/results.js:87`
- `shared/styles/home/cards/16-empty-tablet.css:2`
- Live desktop screenshot and computed-style inspection confirmed the panel remained approximately 126 pixels tall while `hidden=true`.

#### Required fix

- Add a reliable hidden-state rule, such as an appropriate `[hidden]` selector.
- Check every other use of `.empty-state-card`.
- Add a browser regression test for both empty and non-empty result states.

#### Verification

- [x] `space station` returns shows without displaying the empty state.
- [x] A genuinely empty query displays the empty state.
- [x] Clearing filters restores shows and hides the empty state.
- [x] Recently added and collection empty states still work.
- [x] Mobile and desktop behavior match.

### BLOCKER-03 — Rate limiting identifies Cloudflare proxies, not visitors

- **Status:** Ready for verification
- **Area:** Security, availability, ratings, submissions, chat, maintainer access
- **Severity:** Launch blocker while interactive features are enabled

#### Finding

Caddy proxies Echo directly to `127.0.0.1:3010` without a trusted-proxy/client-IP configuration. Express trusts only loopback. Production rate-limit records, classified without exposing their values, showed Cloudflare addresses being used as client identities rather than real visitors.

Caddy ignores untrusted incoming forwarded-for values by default. When a CDN is in front of Caddy, trusted proxy ranges and client-IP parsing must be deliberately configured.

Reference:

- <https://caddyserver.com/docs/caddyfile/directives/reverse_proxy>
- <https://caddyserver.com/docs/caddyfile/options>

#### Impact

- Community/profile writes: 20 requests per 10 minutes
- Submissions: 3 per hour
- Chat: 40 per 10 minutes
- Maintainer authentication: 5 per 15 minutes

The community widget calls `POST /api/community/profiles/anonymous` during show-page initialization. A small number of show visits through the same Cloudflare egress address can therefore exhaust the shared community limit for unrelated users.

#### Evidence

- `/etc/caddy/Caddyfile:141-152`
- `backend/lib/config.js:38`
- `backend/lib/routes/community-routes.js:76-88`
- `backend/lib/store/rate-limit-store.js`
- Production rate-limit row classification

#### Required fix

- Fix this together with direct-origin restriction.
- Configure Caddy to trust only current Cloudflare proxy ranges.
- Use the correct strict client-IP parsing behavior.
- Ensure direct clients cannot spoof Cloudflare client-IP headers.
- Confirm Express receives the actual client address.
- Reassess whether passive profile creation should consume a write limit.

#### Verification

- [ ] Two external clients produce distinct anonymized rate-limit identities.
- [ ] One client cannot consume another client's rate limit.
- [x] A direct-origin request cannot spoof a Cloudflare client-IP header.
- [ ] Ratings, submissions, chat, and maintainer rate limits still enforce correctly.
- [x] Cloudflare range updates have an owned maintenance process.

The July 31 origin-gate stage applied strict trusted Cloudflare ranges and
`CF-Connecting-IP` forwarding, then proved that direct loopback requests with
spoofed forwarding/client-IP headers and mismatched Host/SNI could not reach
Echo. Distinct-client and full interactive-flow evidence still requires two
external connections.

### BLOCKER-04 — Cloudflare can be bypassed through the origin

- **Status:** Ready for verification
- **Area:** Hosting security, availability
- **Severity:** Launch blocker

#### Finding

A direct TLS request to the hosting address using `echoarchives.net` as SNI returned the production site with HTTP 200 and no Cloudflare response marker. The origin is discoverable through another hostname hosted by the same Caddy instance.

#### Impact

An attacker can bypass Cloudflare-side filtering, traffic controls, and any WAF rules by connecting directly to the origin.

#### Required fix

- Restrict origin traffic to approved Cloudflare networks or use another authenticated origin design.
- Preserve certificate renewal and required health-check paths.
- Coordinate the restriction with real-client-IP configuration.
- Confirm unrelated co-hosted services are not unintentionally broken.

#### Verification

- [x] Cloudflare-proxied requests continue to work.
- [x] Direct requests to the origin for `echoarchives.net` fail.
- [x] Spoofed `Host`, SNI, `X-Forwarded-For`, and Cloudflare client-IP headers do not bypass the restriction.
- [ ] Certificate issuance/renewal still works.
- [ ] Health monitoring checks the intended path.

### BLOCKER-05 — The canonical production deployment could not run

- **Status:** Ready for verification
- **Area:** Deployment, rollback, importer storage
- **Severity:** Launch blocker

#### Finding

The production worktree was already dirty when the audit began:

- seven modified tracked files;
- 48 untracked importer cover-staging directories;
- one untracked backup setup script.

The canonical deployment script deliberately aborts when the worktree is not clean:

- `deploy/update-echo-archives.sh:40-42`

Importer staging is not ignored, so ordinary importer work can repeatedly make production undeployable.

There is also a stale duplicate deployment script at the repository root:

- `update-echo-archives.sh`

The duplicate uses `npm install`, omits generation checks, tests, backup, and production configuration validation, and reloads/restarts Caddy.

#### Required fix

- Preserve and review the existing worktree changes.
- Decide whether importer staging is:
  - durable operational state that must be backed up;
  - temporary state that can be ignored/recreated;
  - or publishable state that must be committed.
- Restore a clean, reproducible deployment checkout.
- Remove or clearly disable the stale deployment entry point.
- Document the only supported deployment command.

#### Verification

- [x] `git status --short` is clean after the local remediation commit.
- [x] Importer operation no longer unexpectedly dirties the deploy checkout.
- [ ] The canonical script completes its pre-restart checks.
- [ ] Generated output stays clean.
- [ ] The supported rollback path has been tested.

The remediation commit is now on `origin/main`, its remote Verify workflow
passed, importer staging is preserved and ignored, and the duplicate root
entry point is a compatibility wrapper. The complete maintenance script adds a
safe disposable failure/rollback invariant drill. The canonical deployment's
pre-restart and real production rollback behavior remain unchecked until the
controlled maintenance window.

### BLOCKER-06 — No proven external outage alerting

- **Status:** In progress
- **Area:** Monitoring, incident response
- **Severity:** Launch blocker

#### Finding

The local monitor runs every five minutes. It currently fails truthfully because
the off-site backup success marker is stale; the next maintenance run must
refresh the marker through a fully verified Restic job before the monitor can
pass. The monitor runs on the same physical host as the application and
therefore cannot alert when the host, power, network connection, or Caddy
instance is unavailable.

The documented external monitoring provider and recipients have not been configured. The existing Continental status service does not monitor Echo Archives.

#### Evidence

- `deploy/MONITORING_PLAN.md:3-18`
- `deploy/MONITORING_PLAN.md:62-70`
- `echo-archives-local-monitor.timer` is enabled; its service currently reports
  the stale off-site backup marker
- No Echo check exists on the inspected external status surface

#### Required fix

- Configure account-backed monitoring outside this host.
- Monitor from at least two regions if practical.
- Record recipients, ownership, and escalation.
- Test failure, recovery, and stale-backup delivery.

#### Verification

- [ ] An Echo outage produces a received alert.
- [ ] Recovery produces a received recovery notification.
- [ ] A stale off-host backup produces a received alert.
- [ ] Alert ownership and escalation are documented privately.
- [ ] The monitor remains functional when this host is powered off.

## High-priority findings

### HIGH-01 — Ollama is outdated and affected by a high-severity advisory

- **Status:** Ready for verification
- **Installed version:** `0.6.7`
- **Current version during audit:** `0.32.5`
- **Binding:** Loopback, `127.0.0.1:11434`

Ollama versions below `0.17.1` are affected by CVE-2026-7482/GHSA-x8qc-fggm-mpqg, a reviewed high-severity heap out-of-bounds read issue. The upstream `/api/create` and `/api/push` endpoints can be used to expose process memory in affected deployments.

Echo was only observed using `/api/generate`, and Ollama is not directly public, which reduces immediate exposure. The version is still unsuitable for a shared production host.

References:

- <https://github.com/advisories/GHSA-x8qc-fggm-mpqg>
- <https://github.com/ollama/ollama/releases>

Required work:

- [ ] Upgrade Ollama through a controlled maintenance window.
- [ ] Confirm loopback-only binding after upgrade.
- [ ] Retest Ask the Archivist success, timeout, and fallback behavior.
- [ ] Confirm no unintended Ollama routes are exposed through Caddy or Echo.

The official 0.32.5 upgrade and 0.6.7 fallback archives are privately staged
and checksum-verified. The orchestrator preserves the actual installed
binary/library/unit, upgrades with current-stage rollback, checks the bind,
model, direct generation and public non-exposure, then tests Archivist success
and fallback in isolated restored applications. Production execution is
pending.

### HIGH-02 — Caddy is behind current security-bearing releases

- **Status:** Verified
- **Installed version:** `2.11.4`
- **Current version during audit:** `2.11.4`

Intervening Caddy releases include security and security-adjacent patches.

Reference:

- <https://github.com/caddyserver/caddy/releases>

Required work:

- [x] Review compatibility and release notes.
- [x] Upgrade Caddy.
- [x] Validate the full shared-host Caddyfile.
- [x] Retest every co-hosted service and Echo redirect/TLS path.

The July 31 Caddy upgrade stage installed the checksum-pinned 2.11.4 package,
validated the complete live configuration, retained the shared Caddyfile,
rechecked every co-hosted baseline, and passed Echo public, direct-origin,
redirect, and TLS checks. The service remains active on 2.11.4.

### HIGH-03 — Echo runs as an interactive user with weak systemd isolation

- **Status:** Verified
- **Area:** Host security, blast radius

At audit time Echo ran as `charlie`, which also owns the repository, database,
environment file, and unrelated personal/shared files. `systemd-analyze
security` rated that unit `8.7 EXPOSED`.

Current protections include:

- `NoNewPrivileges=true`
- `PrivateTmp=true`
- restrictive umask

Missing or limited protections include a dedicated service user and stronger filesystem, device, kernel, and address-family isolation.

Required work:

- [x] Create a dedicated Echo service account.
- [x] Give it access only to required runtime files.
- [x] Add compatible `ProtectSystem`, `ProtectHome`, `PrivateDevices`, kernel, and address-family restrictions.
- [x] Retest database writes, static serving, Ollama access, backup operation, and deployment.

The July 31 runtime migration and resumed idempotent check passed under the
dedicated `echo-archives` account. Repository ownership remains with `charlie`;
runtime writes are limited to the declared database/publication/staging paths.
The hardened unit passed systemd validation plus live database-write, static,
Ollama-loopback, local-backup, importer/publication, protected-checkout,
namespaced-journal, structured-log, restart, and health checks.

### HIGH-04 — Exact firewall exposure could not be verified

- **Status:** Ready for verification

Positive evidence:

- SSH is key-only.
- Root SSH login is disabled.
- Password SSH login is disabled.
- fail2ban is active.
- UFW appears enabled with a default-drop policy.

Unknown:

- Exact active UFW rules were not readable without elevated access.
- Other all-interface listeners exist on the shared host.
- Public reachability of those unrelated listeners was not proven.

Required work:

- [ ] Capture `ufw status numbered` with authorized elevation.
- [ ] Map every public listener to an owner and purpose.
- [ ] Close or restrict anything not explicitly required.
- [ ] Confirm Netdata and administrative services are not public.

### HIGH-05 — No Echo-specific access logs or request observability

- **Status:** Ready for verification

Application and Caddy logs contain startup and application errors but no bounded Echo access log. There is no reliable way to investigate:

- real traffic volume;
- elevated 4xx/5xx rates;
- slow production routes;
- rate-limit behavior;
- abuse patterns;
- broken external user flows.

The current monitoring plan intentionally defers access logs until privacy and retention are decided.

Evidence:

- `deploy/MONITORING_PLAN.md:55-60`

Required work:

- [x] Define a privacy-preserving log schema.
- [x] Exclude cookies, authorization, Turnstile tokens, passphrases, and submitted private content.
- [x] Set bounded retention and disk limits.
- [x] Add basic 4xx/5xx, latency, and rate-limit visibility.

Repository implementation is tested. The dedicated-account migration verified
that the running production process emits structured access events into the
14-day Echo journal namespace, and the live health response reports access
logging enabled. The final maintenance stage's strict production event-schema
check remains pending.

### HIGH-06 — Backup scope does not reproduce the complete service

- **Status:** Ready for verification

Positive evidence:

- Daily online SQLite backups pass integrity and foreign-key checks.
- A legacy encrypted Restic off-host snapshot and repository baseline exist;
  the current expanded job is failing closed and its success marker is stale.
- Off-host retention is configured.
- The latest inspected repository integrity check passed.
- Off-host freshness is currently enforced by the local monitor.

Gap:

The off-host process covers the newest SQLite backup but not all non-reconstructible production state, including:

- dirty/uncommitted repository changes;
- importer cover staging;
- recently changed/unpublished cover assets;
- `backend/.env`;
- Caddy configuration;
- systemd units and private monitoring configuration;
- private recovery documentation.

Required work:

- [x] Define the complete recovery inventory.
- [x] Add each host-held required item to the encrypted recovery inventory,
  excluding only the separate repository unlock material.
- [ ] Exclude secrets only when there is a separately tested secret-recovery process.
- [ ] Document encryption keys, ownership, and emergency access privately.

The canonical job now stages importer state outside Restic's active cache, the verified database, every
runtime-writable catalog/cover/review/generated publication path, production
environment, Caddyfile, application/backup/discovery/monitoring units, local
monitoring and Restic environments, Better Stack environment/drop-in, journal
retention, runtime-account readiness/drop-in, and Ollama unit. It rejects
symlinked durable state, checks every staged inventory path exists in the new
remote snapshot, and never stages the Restic password or SSH private key. It
also rejects overlapping cache/staging paths and zero-file or undersized Restic
summaries before success publication. The expanded inventory and assertions are locally tested but have not yet
completed a production encrypted upload and restore.

Changed/verified files:

- `deploy/echo-archives-offsite-backup.sh`
- `deploy/echo-archives-offsite-backup.service`
- `deploy/complete-pi-backup-setup.sh`
- `deploy/verify-restored-application.sh`
- `deploy/OFF_HOST_BACKUP_PLAN.md`
- `tools/test/operations.test.js`

### HIGH-07 — A current restore has not been independently verified

- **Status:** Ready for verification

The readiness tooling reports a previous successful restore, but the protected log was not readable during the audit. The current off-host repository passed `restic check`, which verifies repository integrity but does not prove application recovery.

Required work:

- [ ] Restore the marker-pinned last successful remote snapshot into a
      temporary directory.
- [ ] Run SQLite integrity and foreign-key checks.
- [ ] Start an isolated application against the restored database.
- [ ] Verify health and representative reads.
- [ ] Record elapsed time and cleanup.

### HIGH-08 — SQLite durability may not meet the desired RPO

- **Status:** Verified

At audit time the production database used:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

Evidence:

- `backend/lib/store/database.js:609-616`

SQLite documents that WAL plus `NORMAL` remains consistent but may roll back a recently committed transaction following power or OS failure:

- <https://www.sqlite.org/pragma.html>

No UPS was detected during the audit.

Required decision:

- [x] Record acceptable RPO for ratings and submissions.
- [x] Decide whether to use `synchronous=FULL`.
- [x] Decide whether a UPS is required.
- [x] Test the chosen setting under representative write concurrency.

Decision/evidence: use WAL plus `synchronous=FULL`. A repeatable temporary-DB
mixed-write benchmark measured `NORMAL` at 0.38 ms mean/0.76 ms p95 and `FULL`
at 20.20 ms mean/25.80 ms p95. The owner accepted no UPS for initial launch and
a maximum 24-hour catastrophic-host-loss RPO; the measured durability cost is
insignificant for the expected interactive workload. The July 31 live local
and public health responses both reported WAL and `synchronous=FULL` after the
dedicated-account restart.

### HIGH-09 — Local backup retention is unbounded

- **Status:** Ready for verification

There were 18 local backups using approximately 1.21 GiB. Database size grew substantially during importer activity. Disk usage is currently healthy at approximately 30%, with about 314 GiB free, so this is not an immediate capacity problem.

Required work:

- [x] Define local retention.
- [ ] Implement cleanup only after confirming off-host retention and restore behavior.
- [ ] Monitor backup-directory size.

### HIGH-10 — Deployment automatic rollback was not defined

- **Status:** Ready for verification

The original canonical deployment:

- checks for a clean tree;
- fast-forwards from the upstream;
- installs locked production dependencies;
- validates production configuration;
- builds and tests;
- creates an online backup;
- restarts the service;
- retries health.

The canonical script now validates a disposable candidate, records the prior
revision and dependency tree, preserves the database, and automatically
restores the previous application/dependencies if post-restart health fails.
`deploy/verify-deployment-rollback-invariants.sh` exercises failure detection,
prior-revision compatibility, and no-data-rollback on a disposable database
and worktree. A real systemd-backed failed deployment is still required before
this finding can be marked Verified.

Required work:

- [x] Define the exact rollback revision/artifact.
- [x] Define database rollback boundaries.
- [ ] Test rollback without losing accepted user writes.
- [x] Record expected deployment downtime.

### HIGH-11 — CI runs an EOL Node version and does not match production

- **Status:** Verified

GitHub Actions uses Node 20:

- `.github/workflows/verify.yml:17-22`

Production uses Node `22.23.1`. Node 20 is EOL, while Node 22 remains LTS.

Reference:

- <https://nodejs.org/en/about/previous-releases>

Required work:

- [x] Move CI to Node 22 or Node 24.
- [x] Prefer matching production or test both current production LTS and the intended next LTS.
- [x] Confirm the latest remote CI run passes.

GitHub Actions Verify run `30656424109` passed on Node 22 for the July 31
resumed-maintenance fix, including all 35 tooling tests and the full backend and
browser suite.

### HIGH-12 — Production feature configuration is ambiguous

- **Status:** Verified

The systemd unit declares:

```text
COMMUNITY_RATING_WRITES_ENABLED=false
```

The later environment file overrides it. Live health reports:

```json
{
  "communityRatingWrites": true,
  "maintainerReview": true
}
```

The behavior is technically consistent with systemd environment precedence, but the unit alone gives operators the wrong impression.

Required work:

- [x] Establish one authoritative source for each production feature flag.
- [x] Document environment precedence.
- [x] Include expected feature state in the pre-launch gate.

### HIGH-13 — Privacy controller identification appears incomplete

- **Status:** Verified

The policy identifies the operator only as:

> The Echo Archives is operated as a Continental project.

Evidence:

- `site-src/pages/privacy.html:93-98`
- `site-src/pages/cookies.html:91-95`

For an EU/Swedish launch, GDPR Article 13 requires the identity and contact details of the controller:

- <https://eur-lex.europa.eu/legal-content/EN/AUTO/?uri=CELEX:32016R0679>

Required work:

- [x] Identify the responsible natural or legal person.
- [x] Add appropriate controller contact details.
- [ ] Confirm jurisdiction, minors policy, and rights-request handling with qualified legal review.

Implemented pending professional review: Charlie Arnerstål, operating The Echo
Archives as a Continental project; `privacy@echoarchives.net`; establishment in
Sweden under applicable Swedish/EU law; IMY as supervisory authority; and a
general-audience/not-directed-under-13 notice without inventing a company,
registration number, address, or DPO.

### HIGH-14 — Storage and cookie inventory is incomplete

- **Status:** Ready for verification

The legal pages accurately disclose the Echo voter cookie, community-profile localStorage, chat session storage, IP/user-agent handling, submissions, Turnstile, and optional analytics.

Observed omissions:

- A fresh passive homepage visit received Cloudflare's `cf_clearance` cookie.
- Scroll restoration uses the `echo-scroll:/` session-storage key.

Evidence:

- `site-src/pages/cookies.html:98-132`
- `shared/app/scroll-restoration.js`

Required work:

- [ ] Confirm when and why `cf_clearance` is set.
- [x] Add it and the scroll key to the current inventory if applicable.
- [x] Confirm retention and lawful/necessary classification.
- [ ] Recheck the site with and without Cloudflare challenge behavior.

### HIGH-15 — Passive show views create permanent community profiles

- **Status:** Verified

Opening a show page initializes an anonymous profile and can set:

- `echo-community-voter`, HTTP-only, secure, same-site lax, approximately 400 days;
- `echo-community-profile-id` in localStorage.

This happens before a visitor submits a rating. It:

- creates empty database rows;
- consumes the community write limit;
- increases passive data collection;
- amplifies the proxy-IP rate-limit problem.

Required work:

- [x] Defer profile creation until a real rating action.
- [x] Ensure read-only show views do not require a write.
- [ ] Add cleanup or expiry behavior for abandoned profiles if retained.

### HIGH-16 — Submission form has critical ARIA violations

- **Status:** Verified

The new-show invalid state produced two critical Axe violations:

1. `aria-required` is invalid on the `role="group"` listen-link container.
2. `aria-errormessage` targets an error element that is not exposed using the required alert/live-region technique.

Evidence:

- `shared/app/submit/render/link-fields.js:104-110`
- `shared/app/submit/render/base-fields.js:37-49`
- Error rendering in `shared/app/submit/render/base-fields.js:124-135`
- Error state in `shared/app/pages/submit/ui.js:179-205`

The first invalid states for correction, listener review, and creator verification passed the same automated scan.

Required work:

- [x] Remove or replace invalid `aria-required` usage.
- [x] Make field errors programmatically announced.
- [x] Retest focus movement and invalid-state announcements.
- [x] Add this state to the default accessibility smoke suite.

### HIGH-17 — Twelve user-facing external links are confirmed broken

- **Status:** Verified

Confirmed after GET verification:

| Show | Broken destination |
| --- | --- |
| Death by Dying | Apple URL missing/invalid id |
| Desert Skies | Merchandise page |
| EOS 10 | Official website |
| Impact Winter | Removed Apple listing |
| Midnight Burger | YouTube channel |
| Midnight Radio | Website |
| Red Valley | Merchandise page |
| The DECA Tapes | Removed Apple listing |
| The Penumbra Podcast | RedCircle page |
| The Phenomenon | Removed Apple listing |
| The White Vault | YouTube channel |
| We're Alive | Store |

Additional inconclusive or degraded destinations included certificate failures, HTTP 500, timeouts, unstable Twitter URLs, and bot blocks. Every affected show still had at least one alternative listen or official link.

The current checker deliberately skips external destinations:

- `backend/scripts/check-links.js:48-50`

Required work:

- [x] Repair or remove each originally confirmed broken URL.
- [ ] Recheck inconclusive certificate/error destinations manually.
- [x] Add a low-frequency external link-health process with retry and bot-block classification.

The first post-remediation scan found eleven additional confirmed failures;
those were repaired or removed with denylist/replacement regressions. A final
bounded GET scan found zero confirmed HTTP failures across 412 unique
destinations. Four TLS failures, twelve bot blocks, and one inconclusive
response remain explicitly unverified and need periodic/manual follow-up.

### HIGH-18 — Shared-host and physical-host single points of failure

- **Status:** In progress

The production system depends on:

- one physical Lenovo desktop;
- one NVMe disk;
- one power source;
- one internet connection;
- one Caddy instance shared with unrelated services;
- one SQLite database;
- one primary operator account.

No RAID or UPS was confirmed. Caddy logs showed unrelated co-hosted service errors, demonstrating shared component blast radius.

Required work:

- [x] Record acceptable downtime and RTO.
- [x] Confirm UPS availability or acceptance of power-loss risk.
- [ ] Decide whether public-launch traffic warrants a dedicated host or failover path.
- [ ] Ensure external alerts and tested recovery match the accepted risk.

Later resilience recommendation: first measure the host plus router/ONT peak
wall draw. If it remains below roughly 450 W, use a 230 V line-interactive,
pure-sine, USB-managed UPS in the 1500 VA/900 W class and configure automatic
graceful shutdown. The CyberPower CP1500EPFCLCD is one current example with
active-PFC support, user-replaceable battery, 900 W capacity, and a stated
10-minute half-load runtime:
<https://www.cyberpower.com/eu/en/product/sku/CP1500EPFCLCD>. Size upward if the
measured load exceeds 50% of rated watts or if more runtime is required.

## Lower-priority improvements

### IMPROVEMENT-01 — Social preview image

- **Status:** Open

The default OG image is `echo-wordmark1.png`, approximately 6000×2160 with a 2.78:1 ratio. The unused `og-image.png` is 977×255. Neither is a conventional 1200×630 social card, and image width/height metadata is absent.

- [ ] Create a purpose-built 1200×630 archive-branded preview.
- [ ] Add OG dimensions.
- [ ] Verify common social crops.

### IMPROVEMENT-02 — Homepage request and execution cost

- **Status:** Open

Synthetic mobile test using Fast 4G and 4× CPU throttling:

- TTFB: 334 ms
- FCP: 1,564 ms
- LCP: 2,448 ms
- CLS: 0
- Resources: 99
- Transfer: approximately 640 KB
- Long-task time: approximately 1,042 ms

This is close to the 2.5-second good LCP boundary. Desktop cold load used 131 resources and approximately 1.22 MB transfer.

- [ ] Reduce module/request count.
- [ ] Profile long tasks.
- [ ] Recheck card/community initialization cost.
- [ ] Preserve the dense browse layout.

### IMPROVEMENT-03 — Image weight

- **Status:** Open

- The small top-rated badge transferred approximately 144 KB.
- Four original covers exceed 500 KB.

- [ ] Resize/compress small UI imagery.
- [ ] Confirm responsive cover variants are used everywhere.
- [ ] Preserve visual quality.

### IMPROVEMENT-04 — CAA record

- **Status:** Optional

No CAA DNS record was found.

- [ ] Decide whether to restrict permitted certificate authorities.

### IMPROVEMENT-05 — Caddy formatting

- **Status:** Open

`caddy validate` passes, but reports that `/etc/caddy/Caddyfile` is not formatted.

- [ ] Format only during a reviewed Caddy change.
- [ ] Validate and reload without restarting unrelated services unnecessarily.

### IMPROVEMENT-06 — CSP tightening

- **Status:** Open

The CSP is otherwise strong but permits `style-src 'unsafe-inline'`.

- [ ] Inventory inline styles.
- [ ] Remove the allowance if practical without destabilizing rendering.

### IMPROVEMENT-07 — Browser coverage

- **Status:** In progress

Chromium coverage is extensive. Firefox and WebKit browser binaries were not installed during the original audit.

- [x] Add Firefox smoke coverage.
- [x] Add WebKit coverage.
- [ ] Test at least one real iOS and Android device.

Verification evidence: all 60 serial smoke tests passed locally in Firefox and
all 60 passed in WebKit. Tests cover desktop/mobile layout, hydration,
generated and client-rendered states, reduced motion, focus/dialog behavior,
offline handling, and maintainer/submission surfaces. A real Safari/iOS device
and a real Android browser remain external manual checks.

Changed/verified files:

- `backend/test/browser.smoke.js`
- `backend/test/discovery-stability.smoke.js`
- `backend/test/home-browse.smoke.js`
- `backend/test/home-card-interactions.smoke.js`
- `backend/test/show-detail-navigation.smoke.js`

### IMPROVEMENT-08 — Journal retention

- **Status:** Ready for verification

Journald was using approximately 3.9 GB with default limits and no Echo-specific retention policy.

- [ ] Define system journal limits.
- [ ] Preserve enough history for incident review.

### IMPROVEMENT-09 — Remove duplicate deployment entry point

- **Status:** Verified

The root `update-echo-archives.sh` is weaker and conflicts with the canonical `deploy/update-echo-archives.sh`.

- [x] Convert it into a safe delegating wrapper.
- [x] Update operational documentation to name one path.

Verification evidence: the root entry point contains only argument-preserving
delegation to `deploy/update-echo-archives.sh`; shell syntax and tooling
regression tests pass, and it contains no independent npm, Caddy, or systemd
actions.

## Confirmed healthy foundations

### Application and tests

- Complete isolated `npm run verify` passed.
- 17 tooling tests passed.
- 202 backend tests passed.
- 59 Chromium smoke tests passed.
- Catalog and page generation matched the committed production source.
- Structure, internal links, assets, and data validation passed.
- Backend dependency audit found zero known vulnerabilities across 141 packages.

### Live routes and SEO

- Sitemap contained 141 URLs.
- Every sitemap URL returned HTTP 200 during the gentle crawl.
- Canonicals were exact.
- Every crawled page had one H1, title, description, expected indexability, and valid JSON-LD.
- No duplicate titles or canonical URLs were found.
- `robots.txt`, sitemap, redirect, and filtered-query noindex behavior worked.
- Branded 404 pages worked.
- No broken internal links or assets were found.

### Security controls

- Application binds to `127.0.0.1:3010`.
- Strong CSP nonce behavior is present.
- `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, restrictive permissions policy, referrer policy, and HSTS are present.
- Traversal and `.env` requests returned 404.
- Unauthenticated maintainer APIs returned 401.
- No cross-origin API allowance was found.
- Inputs are validated and size-limited.
- SQL uses prepared statements.
- HTML output is escaped.
- Maintainer cookies are secure, HTTP-only, same-site lax, expiry-bound, and HMAC-verified.
- URL and cover fetching include DNS/private-network SSRF protection, redirect rechecks, timeouts, byte limits, MIME validation, and SVG rejection.
- There are no public file-upload endpoints; the importer fetches URLs.

### Database and backup

- SQLite quick check: `ok`
- Foreign-key violations: `0`
- Journal mode: WAL
- Busy timeout: 5 seconds
- Catalog shows: 100
- Collections: 29
- Community ratings at audit completion: 0
- Submissions at audit completion: 0
- Reviews at audit completion: 0
- Latest local backup passed integrity and foreign-key verification.
- Off-host Restic repository check passed.
- Off-host backup retention is configured.
- Root filesystem was approximately 30% used with about 314 GiB free.

### Accessibility and responsive behavior

- Most scanned routes and states produced zero Axe violations.
- Correction, listener-review, and creator-verification invalid states passed.
- No horizontal overflow was found at:
  - 320 px
  - 390 px
  - 768 px
  - 1024 px
  - 1440 px
- Heading order, landmarks, duplicate IDs, image alternatives, and basic semantics were sound.
- Controlled smoke coverage passed keyboard, touch, focus trap, reduced motion, CLS, offline, loading, and error states.

### Performance

Desktop cold homepage:

- TTFB: 346 ms
- FCP: 576 ms
- LCP: 604 ms
- CLS: 0

Synthetic mobile show page:

- TTFB: 329 ms
- FCP/LCP: 1,304 ms
- CLS: 0
- Transfer: approximately 129 KB

Gentle local homepage probe:

- 20 requests
- concurrency 2
- p50: 14.6 ms
- p95: 43.1 ms

This probe is not launch-capacity evidence.

## Owner decisions received and areas not verified

The owner supplied the previously missing operating decisions during
remediation:

- application RTO `1 hour`; complete host-loss RTO `24 hours`;
- catastrophic host-loss RPO no more than `24 hours`;
- no accepted user-data loss during ordinary deploy/restart/rollback;
- planned deployment downtime `5 minutes`; failed deploy plus rollback
  `15 minutes`;
- local backup retention `30 days`; existing off-site retention retained;
- expected early traffic below 1,000 visits/day, approximately 25 concurrent
  visitors and brief peaks near 10 requests/second;
- no confirmed UPS; the initial power-loss risk is explicitly accepted and is
  not independently a launch blocker;
- Better Stack with `alerts@echoarchives.net` email and push is the selected
  external alert path;
- ratings and maintainer review are intended at launch only after complete
  production-flow verification;
- detailed access telemetry retention `14 days`, no raw addresses, weekly
  keyed pseudonyms, and non-identifying aggregates up to `90 days`;
- a dedicated Echo runtime account is required before launch;
- production proxy/spoof, restore, isolated-app, controlled maintenance, Caddy,
  systemd, and Ollama actions are authorized.

### Product and traffic

- Whether any real user data is present
- Final day-one availability for submissions, chat, creator verification,
  importer publication, and other moderation actions

### External services and accounts

- Cloudflare account settings and ownership
- Cloudflare WAF and rate-limit rules
- Cloudflare SSL mode
- Cloudflare account-side confirmation of the applied origin restriction
- Turnstile account behavior beyond the public integration
- Plausible ownership and intended enablement
- Podcast Index account/credentials
- Apple/Patreon/contact ownership
- Any paid actions required for testing

### Operations

- Better Stack account creation, heartbeat secret, recipients, mobile device,
  and received failure/recovery/stale-heartbeat drills
- Remaining Ollama, Restic restore/backup, firewall/storage evidence, rollback,
  and final-verification stages; Caddy 2.11.4 and the dedicated Echo systemd
  runtime migration are applied
- Exact UFW rules
- SMART/NVMe health
- SMART/NVMe follow-up and a later UPS recommendation/purchase

### Live state-changing flows

These are now authorized where a disposable/restored database can be used, but
remain incomplete until the isolated production verification window:

- successful rating create/update/remove with Turnstile;
- all submission types;
- moderation and deletion;
- maintainer sign-in;
- maintainer import/review/publish;
- end-to-end contact delivery;
- Patreon or paid actions.

### Browser and legal

- Firefox behavior
- Safari/WebKit behavior
- Physical mobile devices
- Screen-reader testing beyond automated basics
- Professional legal approval

## Prioritized remediation plan

### P0 — before announcing launch

1. Preserve and resolve the existing production worktree.
2. Decide and document importer-staging lifecycle.
3. Fix null archive-rating handling everywhere.
4. Regenerate affected pages and add regression tests.
5. Fix hidden empty-state styling and add result-state coverage.
6. Restrict direct origin access.
7. Configure secure real-client-IP handling.
8. Verify rate limits with two distinct external connections.
9. Upgrade Ollama.
10. Upgrade Caddy.
11. Configure external uptime and backup alerts.
12. Prove alert failure, recovery, and stale-backup delivery.
13. Perform and document an off-host restore.
14. Define and test application rollback.
15. Identify the legal controller and correct storage disclosures.
16. Deploy only through the canonical script from a clean tree.

### P1 — launch quality and resilience

1. Fix submission ARIA errors.
2. Repair confirmed external links.
3. Expand backup scope to complete non-reconstructible state.
4. Decide SQLite durability and UPS requirements.
5. Add privacy-bounded access logs and request metrics.
6. Move Echo to a dedicated system account.
7. Harden the systemd unit.
8. Align CI with a supported production Node release.
9. Consolidate production feature configuration.
10. Remove the duplicate deployment path.

### P2 — polish after blockers

1. Optimize homepage module count and long tasks.
2. Optimize heavy images.
3. Add a proper social preview image.
4. Add Firefox, WebKit, and real-device coverage.
5. Add external-link monitoring.
6. Decide on CAA.
7. Tighten CSP where practical.
8. Configure journal retention.

## Exact pre-launch rerun checklist

### Repository gate

```bash
cd /home/charlie/The-Echo-Archives

git status --short
git fetch --prune
git status -sb
git diff --check
git fsck --no-dangling

NODE_ENV=production npm run check:config
npm run verify
npm --prefix backend audit --omit=dev
npm run check:backup -- --max-age-hours 30
```

Expected result:

- [ ] Worktree is clean.
- [ ] Production branch matches its intended upstream.
- [ ] Full verification passes.
- [ ] Dependency audit passes.
- [ ] Backup is fresh and valid.

### Host and proxy gate

```bash
systemctl --failed
systemctl is-active echo-archives.service caddy.service
systemctl is-enabled \
  echo-archives.service \
  caddy.service \
  echo-archives-backup.timer \
  echo-archives-local-monitor.timer \
  echo-archives-offsite-backup.timer

systemctl list-timers --all --no-pager | rg 'echo-archives'
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

curl --fail --silent --show-error http://127.0.0.1:3010/api/health
curl --fail --silent --show-error https://echoarchives.net/api/health

journalctl -u echo-archives.service --since today --no-pager
journalctl -u echo-archives-local-monitor.service --since today --no-pager
journalctl -u echo-archives-backup.service --since today --no-pager
journalctl -u echo-archives-offsite-backup.service --since today --no-pager
```

Expected result:

- [ ] No failed units.
- [ ] Application and Caddy active.
- [ ] Required timers enabled and scheduled.
- [ ] Caddy configuration valid.
- [ ] Local and public health correct.
- [ ] No unexplained production errors.

### Live functional gate

1. Crawl every sitemap URL and assert:
   - [ ] HTTP 200
   - [ ] expected canonical
   - [ ] title
   - [ ] description
   - [ ] one H1
   - [ ] valid structured data
   - [ ] expected indexability
2. Search for an unrated show:
   - [ ] renders `Unrated`
   - [ ] does not render `0/10`
3. Search `space station`:
   - [ ] results are present
   - [ ] no-results panel is absent
4. Test an actually empty query:
   - [ ] helpful empty state appears
5. With authorized disposable records:
   - [ ] create rating
   - [ ] update rating
   - [ ] remove rating
   - [ ] verify Turnstile
6. Submit one disposable item for every launch-enabled type:
   - [ ] new show
   - [ ] metadata correction
   - [ ] listener review
   - [ ] creator verification
   - [ ] other enabled types
7. Complete moderation:
   - [ ] authenticate maintainer
   - [ ] review
   - [ ] approve/reject
   - [ ] remove test data
8. Ask the Archivist:
   - [ ] success
   - [ ] model timeout
   - [ ] unavailable-model fallback
   - [ ] rate-limit message
9. Contact:
   - [ ] submit
   - [ ] confirm delivery

### External security gate

- [ ] Cloudflare-proxied request succeeds.
- [ ] Direct-origin request fails.
- [ ] Host/SNI/header spoofing cannot bypass origin restriction.
- [ ] Two public networks produce distinct backend client identities.
- [ ] One network cannot consume another's rate limits.
- [ ] Exact UFW rules match documented exposure.
- [ ] No unintended administrative listener is public.
- [ ] TLS 1.2 and 1.3 work.
- [ ] Certificates have more than 21 days remaining.
- [ ] `www` and legacy redirects preserve path/query.

### Accessibility and browser gate

Run Axe and keyboard-only testing at:

- [ ] 320 px
- [ ] 390 px
- [ ] 768 px
- [ ] 1024 px
- [ ] 1440 px

Browsers:

- [x] Chromium automated suite
- [x] Firefox automated suite
- [x] WebKit automated suite
- [ ] Safari on a real iOS/macOS device
- [ ] Chrome on a real Android device

Manual checks:

- [ ] skip link
- [ ] focus visibility
- [ ] dialog focus trap and return
- [ ] mobile menu
- [ ] filters
- [ ] form validation announcements
- [ ] reduced motion
- [ ] offline/loading/error states
- [ ] screen-reader basics

### Recovery and alerting gate

- [ ] Restore marker-pinned last successful encrypted remote snapshot to a
      temporary path.
- [ ] Run SQLite integrity check.
- [ ] Run foreign-key check.
- [ ] Start isolated app against restored data.
- [ ] Verify health and representative records.
- [ ] Record restore time.
- [ ] Clean up temporary restore safely.
- [ ] Trigger and receive outage alert.
- [ ] Trigger and receive recovery alert.
- [ ] Trigger and receive stale-backup alert.
- [ ] Exercise rollback procedure.
- [ ] Record rollback time and any data-loss boundary.

### Content-quality gate

- [ ] Recheck all twelve repaired external links.
- [ ] Recheck certificate/error/timeout destinations.
- [ ] Confirm every show has at least one usable listen link.
- [ ] Confirm no false archive ratings.
- [ ] Confirm creator verification never implies rating/review approval.
- [ ] Confirm legal/controller/contact text is current.
- [ ] Confirm current storage and cookie inventory.

## Audit commands and methods used

The audit used read-only or low-impact checks except for the documented passive profile-bootstrap behavior.

Major checks included:

- repository inventory with `rg`, Git status, `git diff --check`, and `git fsck`;
- isolated dependency installation and `npm run verify`;
- production `NODE_ENV=production npm run check:config`;
- backend dependency audit;
- systemd unit, timer, and security inspection;
- Caddy configuration validation;
- process, listener, DNS, TLS, redirect, header, and health inspection;
- journald review;
- SQLite integrity, foreign-key, journal, table, and size inspection;
- local and off-host backup verification;
- live Playwright desktop/mobile testing;
- Axe scans;
- 141-URL sitemap crawl;
- 420-destination external-link review with cautious concurrency;
- synthetic throttled performance traces;
- a gentle 20-request local health/performance probe at concurrency two.

No service was restarted, no infrastructure was changed, no production record was deleted, and no aggressive load test was run.

## Audit side effects and repository state

### Production data side effect

Passive show-page visits execute the production profile-bootstrap flow. During browser testing:

- community profiles increased from 17 to 23;
- the six audit-created profiles were empty;
- one attempted rating request was rejected by Turnstile;
- a temporary rate-limit row was created;
- no rating, review, submission, verification, or catalog entry was created.

No cleanup was performed because production deletion was not authorized.

### Repository changes from this audit

This report is the only repository file created for the audit:

- `docs/qa/2026-07-28-launch-readiness-audit.md`

The modified backup/off-host files and untracked importer staging directories were already present and were not changed by this audit.
