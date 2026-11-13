# Final test report

## Release gate

`npm run verify` completed with exit status 0 on the final worktree. It completed every repository build, catalog, generated-output, determinism, data, link, serial-backend, and required browser smoke gate.

| Suite | Executed | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| `npm run test:tools` | 192 | 192 | 0 | 0 |
| Backend serial suite (`npm --prefix backend run verify` → `test:serial`) | 560 | 560 | 0 | 0 |
| Required browser smoke suite | 113 | 113 | 0 | 0 |
| **Total test cases** | **865** | **865** | **0** | **0** |

The smoke runner completed all 17 test-file summaries with Chromium available. `axe-core` checks ran; accessibility coverage was 13/13. No suite was skipped or treated as a pass while incomplete.

## Commands and supporting checks

- `npm ci --prefix backend --include=dev --no-audit --no-fund --jobs=2` — restored the declared locked development dependency set, including `axe-core`; no lockfile change.
- `npm --prefix backend run test:scraping-mitigation` — **12/12 passed** on the final mitigation code.
- `npm --prefix backend run check:config` — development configuration valid.
- `npm run verify` — full suite detailed below.
- `node --check` on changed application, guard, storage, migration, script, test, and generated-entry JavaScript files — passed.
- Direct output check — all 12 clean-route aliases exist and are non-empty.
- `git diff --check` — passed.

The final repository command was run with bounded CPU and memory settings:

```bash
/usr/bin/time -v env \
  NODE_OPTIONS='--max-old-space-size=2048 --require=/tmp/echo-archives-sharp-single-thread.cjs' \
  UV_THREADPOOL_SIZE=2 MALLOC_ARENA_MAX=2 \
  taskset -c 0-1 nice -n 10 npm run verify
```

It took 14:00.43 wall-clock, peaked at 786,284 KiB RSS, used two pinned cores, used no swap, and exited 0. The temporary preload limited Sharp concurrency for this constrained validation run; it is not a release/runtime setting.

## Build and integrity results

- `build:catalog`: 752 shows, 54 collections, 8 review companions.
- `build:pages`: completed; 0 social cards needed rendering and 939 were reused.
- `check:structure`, `check:generated`, release artifact sanity, and two-pass `check:build-determinism`: passed.
- All 12 expected clean-route aliases (`about`, `collection`, `cookies`, `copyright`, `creator-standards`, `for-creators`, `help-center`, `privacy`, `show`, `submit`, `supporters`, `terms`) are present at their root route directories.
- Data validation found 0 integrity errors across 752 shows, 47 published collections, 132 entities, and 8 review companions. Existing source/entity-role review warnings remain; they are unrelated to this mitigation.
- Local-link validation covered 18 public pages, 752 shows, and 54 collections.

## Earlier incomplete attempts

The earlier page build was stopped while CPU-bound, before its profile was captured. This did not establish a deadlock. The bounded final build completed and passed deterministic-output checks. The initial missing-route and tool failures therefore came from incomplete generated output; all generated-output tests now pass.

The first smoke attempt could not load `axe-core` because the isolated dependency tree had not yet been installed with development dependencies. `axe-core` was already in the declared, locked project development dependencies. Reinstalling with `npm ci --include=dev` made the accessibility suites execute; they passed. No dependency was added or upgraded.

## Scope limits

All requests and performance fixtures ran locally against temporary SQLite data and local servers/proxies. Nothing in this report measures production capacity, Cloudflare edge hit rate, or the origin of the production 504s. The full historical Nov 6–11 incident replay still requires an isolated snapshot covering all five windows; no such snapshot was present, and no production database was opened.
