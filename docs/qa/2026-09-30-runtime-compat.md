# Runtime and dependency compatibility — 2026-09-30

## Findings

The production line is still Node 22, pinned to `22.23.1` in CI and production. The tested minimum is now `22.14.0`: `better-sqlite3` 13 builds against Node-API 10, which Node 22.12 does not provide. A guard now reports that requirement before loading the native addon. Node 22.12 with the new addon otherwise crashed during a direct database query.

The lockfile now selects `better-sqlite3` 13.0.3, `fast-xml-parser` 5.11.2, and Playwright 1.63.0. The first two address demonstrated compatibility/performance maintenance risks; Playwright was advanced to exercise current browser builds. Other direct dependencies were left alone. In particular, `sharp` 0.35.5 is available, but no concrete compatibility defect justified taking it in this campaign.

The complete repository gate passed on Node 22.23.1/npm 10.9.8 on macOS. The full Firefox serial browser suite passed. The full WebKit serial suite did not: 97 of 102 cases passed, with five browser-specific failures recorded below. No Linux VM/container or Windows environment was available, so those platforms are not claimed as locally verified.

## Environment contract inventory

### Runtime, package manager, and modules

| Contract | Current state | Evidence / status |
| --- | --- | --- |
| Node engine | Root and backend declare `>=22.14.0`. | Explicit in both `package.json` files and current README/operations/architecture docs. The 22.14 floor follows the Node-API requirement, not a test-only preference. |
| Production/CI runtime | Node `22.23.1`. | Explicit in `.github/workflows/verify.yml` and deployment documentation. The workflow targets `ubuntu-latest`. |
| npm | No npm version is pinned and there is no `.npmrc`, `.nvmrc`, `.node-version`, or `packageManager` field. | Implicitly comes from the selected Node distribution. Clean installs were exercised with npm 10.9.x and npm 11.19.x. The only lockfile is `backend/package-lock.json`, lockfile version 3; the root package has no dependencies of its own. |
| Install procedure | `npm --prefix backend ci`. | Explicit in README and CI; clean installs succeeded on the matrix below. npm 10 and npm 11 both consumed the same lockfile. |
| Module formats | Root/backend scripts use Node's default CommonJS mode. `shared/app/` and `shared/library/` set `type: module`; browser modules use native ESM and dynamic imports. | Existing module boundaries were exercised on Node 22, 24, and 26; no module-system rewrite was needed. |
| Node-API | `better-sqlite3` 13 requests Node-API 10. | Local version values and the [official Node-API version matrix](https://nodejs.org/api/n-api.html#node-api-version-matrix) agree: Node 22.14+ provides API 10; 22.12 provides API 9. |

### Direct dependency inventory

Exact locked versions after the controlled updates:

| Package | Role | Locked version | Native / notes |
| --- | --- | ---: | --- |
| `better-sqlite3` | Production | 13.0.3 | Native SQLite addon with packaged prebuilds and a source-build path. SQLite reports 3.53.4. |
| `cheerio` | Production | 1.2.0 | JavaScript. Its current tree still warns through `encoding-sniffer@0.2.1` → deprecated `whatwg-encoding@3.1.1`. |
| `express` | Production | 5.2.1 | JavaScript. |
| `fast-xml-parser` | Production | 5.11.2 | JavaScript. The 5.11.1 validator change replaces a regex with a single-pass scanner for long whitespace runs; see the [upstream changelog](https://github.com/NaturalIntelligence/fast-xml-parser/blob/master/CHANGELOG.md). |
| `sharp` | Production | 0.35.4 | Native image module using the platform package and bundled libvips; local runtime reported libvips 8.18.6. |
| `axe-core` | Development/test | 4.13.0 | Browser accessibility checks. |
| `playwright` | Development/test | 1.63.0 | Browser driver; browser downloads are a separate install step. |

The pinned transitive overrides remain `undici@7.29.1` and `qs@6.16.0`. No direct dependency was added. `npm audit` found zero vulnerabilities in the backend dependency tree. `npm outdated --long` reported only `sharp` 0.35.5 as newer than the lock; it was deferred because this audit found no concrete reason to upgrade it.

### Browsers, native modules, and build inputs

- The repository's browser setup command installs Chromium: `npm --prefix backend run test:setup:browser -- chromium`. CI installs Chromium and Linux system dependencies with Playwright. Firefox and WebKit were installed into an isolated temporary browser directory for this audit.
- Playwright 1.63.0 used Chromium 153.0.8010.12, Firefox 155.0, and WebKit 26.6. Required-mode smoke execution checks for the selected browser and exits nonzero if it is absent; it does not silently count missing coverage as a pass.
- `better-sqlite3` 13 publishes prebuilds for Darwin, Linux glibc/musl, and Windows on x64/arm64. Only macOS arm64 prebuilt loading was directly exercised here; the repository's configured CI is Linux x64, and Windows remains untested in this campaign.
- The normal SQLite install uses the package's prebuilt binary; npm does not run a SQLite compile as an install hook. A manual source build was exercised with the package's `build-release` script on Node 24.21.0. It used macOS clang, `make`, Python 3.13.7, and npm-bundled `node-gyp` 12.4.0. Source builds need Python 3 and a C++20 toolchain (`make` on Unix-like systems; MSVC C++ Build Tools on Windows). `node-gyp` must be available from the active Node/npm toolchain or `PATH`. README now gives the explicit build command and does not imply that npm automatically falls back to compiling.
- `sharp` loaded and processed its native module on the macOS arm64 matrix. Linux and Windows native execution was not observed locally.
- The service worker is generated by `tools/build-pages.js`; the normal build and generated-boundary checks passed. Chromium smoke exercises cached routes and offline fallback.

### Shell, operating system, and external tools

- This campaign ran on macOS 26.5.1, Darwin 25.5.0, Apple Silicon arm64, using zsh. Root build/test commands are Node/npm scripts and passed on this host.
- Production deployment and recovery scripts are intentionally Linux-specific. They assume `/usr/bin/node`/`npm`, systemd, Caddy, `flock`, GNU `stat -c`, GNU `readlink -f`/`realpath -e`, and other Linux utilities. These are deployment contracts, not portable macOS shell commands. The `deploy/echo` runtime preflight now checks both Node 22.14+ and Node-API 10 before installing or starting a release.
- Production Bash scripts use a Bash shebang; deployment paths also depend on GNU utilities and Linux service tooling. The macOS run does not establish that production shell paths work. The configured Ubuntu CI is the intended Linux verification environment; it was not invoked as a remote workflow during this task.
- Browser setup needs downloaded Playwright browser binaries. Linux browser execution also needs the libraries installed by `playwright install --with-deps chromium`. Generated site builds need the locked Node dependencies, including `sharp`; there is no additional catalogue service required for the deterministic build.
- A source scan of `backend/`, `tools/`, `deploy/`, `shared/app/`, and `shared/library/` found no undeclared third-party package imports. Node built-ins, installed direct dependencies, and explicit Playwright browser setup cover those paths. No transitive package was promoted to a direct dependency.

## Runtime matrix

All Node distributions were downloaded from the official release site into `/tmp/echo-runtime-compat/node`; versioned `SHASUMS256.txt` checksums were verified before use. `PLAYWRIGHT_BROWSERS_PATH` pointed to a temporary directory outside the repository.

| Node | npm | Node-API | Result |
| --- | --- | ---: | --- |
| 22.12.0 | 10.9.0 | 9 | Clean install succeeded, but the 13.0.3 native database query reproduced a process crash. After the guard was added, loading the application database exits cleanly with a Node-API requirement message. Unsupported after the raised floor; no full suite claimed. |
| 22.14.0 | 10.9.2 | 10 | Clean install, SQLite/fast XML/sharp loads, and isolated Chromium launch passed. This is the tested minimum; not a full-suite run. |
| 22.23.1 | 10.9.8 | 10 | Clean-install/native/browser checks passed. Full `npm run verify` passed on this runtime. |
| 24.21.0 | 11.19.0 | 10 | Clean install, native loads/query, and Chromium launch passed. Full Firefox smoke passed. WebKit audit outcomes are below. |
| 26.10.0 | 11.19.1 | 10 | Clean install, native loads/query, and Chromium launch passed. Compatibility experiment only; not the supported production pin and not a full-suite run. |

On the current lockfile, `npm approve-scripts --allow-scripts-pending` under npm 11 reported no unreviewed install scripts. The `allowScripts` grant initially considered during the update was removed: the published `better-sqlite3` 13 package has no install hook, and prebuild loading does not need one. Its older `prebuild-install` dependency and associated `fs.R_OK` deprecation warning are gone.

The XML validator also accepted a synthetic 4,194,325-byte RSS document with long whitespace in 23 ms on the upgraded parser. This is a focused regression probe, not a broad XML throughput benchmark.

## Verification results

### Required gate on the production Node line

Command: `npm run verify`

Environment: Node 22.23.1 / npm 10.9.8; macOS arm64; isolated Playwright browser path.

Result: passed. Catalogue and pages built; structure, generated output, release artifact, tool tests, and build determinism checks completed; backend validation and link checks passed; backend serial suite reported 453/453 passing; all required Chromium smoke groups passed with zero failures or skips. The structure check emitted existing source-file-size and referenced-cover soft-limit warnings. No generated artifact drift remained.

Other focused checks on the final task tree:

- `npm --prefix backend ci --no-audit --no-fund` on Node 22.23.1/npm 10.9.8: passed; 112 packages installed. npm emitted the recorded `whatwg-encoding@3.1.1` deprecation warning.
- `node --test backend/test/native-runtime.test.js backend/test/smoke-runner.test.js`: 7/7 passed.
- `node --test --test-name-pattern='checked-in service and proxy retain production hardening' tools/test/operations.test.js`: 1/1 passed.
- Firefox accessibility/tag-picker focused run on Node 22.23.1: 2/2 passed.
- `npm --prefix backend audit`: zero vulnerabilities. `npm --prefix backend outdated --long`: only `sharp` 0.35.5 newer than the current lock.
- `npm --prefix backend explore better-sqlite3 -- npm run build-release` on Node 24.21.0/npm 11.19.0: source build passed; explicitly loading the compiled binding returned SQLite 3.53.4.
- `git diff --check`: passed.

### Other browser engines

Commands used `SMOKE_BROWSER=firefox` and `SMOKE_BROWSER=webkit` with `npm --prefix backend run test:smoke:serial` on Node 24.21.0. The serial runner discovers `*.smoke.js` under `backend/test/`.

- Firefox: 102/102 smoke tests passed across the full serial suite, including the maintainer import error/retry/auth-expiry path.
- WebKit: the full run before the last accessibility-test synchronization reported 97/102 passed, with five failures across three files. The cold mobile image budget consistently measured 3,455,601 bytes for `/`, above its 1,205,862-byte cap. Two popular-band assertions retained the fallback/popularity ordering in the full serial run; an isolated ranking case passed once, so this remains load-sensitive/unresolved. Accessibility checks showed WebKit-specific behavior: the visible retry button was not reached by the test's 12 Tab presses, and axe reported `button-name` for a hidden sticky-filter clone despite its text being present in the DOM. The mobile navigation case also timed out once during the full run, then opened in a focused diagnostic. After synchronizing the filter-content opacity, a focused rerun still failed on that hidden-clone axe result. The complete WebKit suite was not rerun after this test-only synchronization. These are not reported as a green WebKit suite or as proven application defects; they need a dedicated Safari/WebKit investigation.
- Firefox exposed a test race where the tag-picker schedules focus with `requestAnimationFrame`; the smoke now waits for the actual input focus. A maintainer retry flow now waits for the selected candidate detail request before switching the mock route to 401. Both changes passed Firefox and the final Chromium gate.
- The accessibility smoke waits for the filter content transition to finish before running axe. This reduced an animation timing race but did not resolve the hidden-clone axe result in WebKit.

## Dependency update decisions

| Change | Classification | Reason / constraint |
| --- | --- | --- |
| `better-sqlite3` 12.10.0 → 13.0.3 | Safe/useful now, with a raised runtime floor | Version 13 uses Node-API 10, bundles its prebuilds, and removes the deprecated `prebuild-install` chain. The 22.12 crash was reproduced. Node 22.14+ is required and is now guarded/documented. See [v13 release notes](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0). |
| `fast-xml-parser` lock 5.10.1 → 5.11.2; declared floor `^5.11.2` | Safe/useful now | Includes the upstream single-pass validator fix for adversarially long whitespace. Existing XML tests and a large synthetic validator probe passed. |
| Playwright 1.60.0 → 1.63.0 | Useful for current browser coverage | Updated the test/browser toolchain and enabled current Chromium/Firefox/WebKit experiments. The unresolved WebKit results remain explicit; this is not a claim of cross-browser parity. |
| `sharp` 0.35.4 → 0.35.5 | Deferred | Only available update reported by `npm outdated`; no task-relevant defect or migration evidence justified churn. |
| Cheerio, Express, `undici`, `qs` | Unchanged | No concrete compatibility/security reason found in this audit. The deprecated `whatwg-encoding` transitive warning under Cheerio remains a maintenance pressure point. |

No application module-system rewrite, product feature, data change, or UI redesign was made.

## Future maintenance pressure points

1. Keep Node 22.14+ and Node-API 10 aligned across engine declarations, deployment preflight, docs, and native runtime guard. A future native-addon major can change that contract again.
2. Keep the Node/npm/lockfile/browser tuple explicit in CI. There is no `.nvmrc` or npm pin; CI's Node 22.23.1 currently supplies npm 10.9.8.
3. Revisit WebKit's keyboard traversal, hidden/inert axe handling, popular-band ordering under a loaded serial suite, and mobile image transfer budget before claiming Safari/WebKit compatibility.
4. Keep Linux production shell checks in Ubuntu CI or a disposable Linux host; macOS verification cannot cover GNU command behavior, systemd, Caddy, or `/usr/bin/node` deployment assumptions.
5. Reassess Cheerio's deprecated `whatwg-encoding` chain and `sharp` patch updates during the next dependency review.

## Files changed

- Runtime/dependency contract: `package.json`, `backend/package.json`, `backend/package-lock.json`, `backend/lib/store/native-runtime.js`, `backend/lib/store/database.js`, and `deploy/echo`.
- Install/operations guidance: `README.md`, `backend/README.md`, `docs/ARCHITECTURE.md`, and `docs/OPERATIONS.md`.
- Compatibility regressions and browser-runner coverage: `backend/scripts/run-smoke-tests.js`, `backend/test/native-runtime.test.js`, `backend/test/smoke-runner.test.js`, `backend/test/accessibility.smoke.js`, `backend/test/maintainer-import.smoke.js`, and `tools/test/operations.test.js`.
- This report: `docs/qa/2026-09-30-runtime-compat.md`.

## References

- [Node-API version matrix](https://nodejs.org/api/n-api.html#node-api-version-matrix)
- [better-sqlite3 13 release notes](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0)
- [fast-xml-parser changelog](https://github.com/NaturalIntelligence/fast-xml-parser/blob/master/CHANGELOG.md)
- [node-gyp platform build requirements](https://github.com/nodejs/node-gyp#installation)
- [Playwright browser installation](https://playwright.dev/docs/browsers)
