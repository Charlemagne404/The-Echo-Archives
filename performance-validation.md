# Performance validation

## Bounded local benchmark

The final isolated mitigation fixture uses temporary local SQLite, a local server, and a synthetic cache proxy. Latest run:

```json
{"sameShowRequests":120,"sameShowConcurrentLatencyMedianMs":527,"sameShowConcurrentElapsedMs":915,"traversalShowPages":240,"traversalElapsedMs":8394,"traversalOriginRequests":240,"traversalSecondPassOriginRequests":0,"distributedAnalyticsEvents":240,"distributedAnalyticsElapsedMs":1299}
```

The first catalogue pass required one origin request per distinct show (240). The second pass reused all 240 proxy entries and made zero origin requests. The traversal completed in 8.394 seconds. The repeated-show batch completed in 915 ms with a 527 ms median; 240 distributed analytics writes completed in 1.299 seconds. These figures are local synthetic results, not production capacity or Cloudflare edge measurements.

The cache-proxy test also covers public JSON, versioned assets, generated social cards, separate query keys, GET/HEAD, ETag revalidation, stale-if-error, errors, and explicit purge. The cache still needs one fill per new URL and per edge location/expiry.

## Page build investigation

The prior page-build process was stopped while consuming CPU, but its process profile was not retained. There is no evidence it deadlocked or became stuck; the exact hottest call from that stopped run cannot be reconstructed. The generator uses Sharp for social-card composition/metadata, which is the native CPU-intensive stage when a card must be rendered.

The bounded rerun completed and the full release build reproduced its outputs. The complete `npm run verify` command ran with two pinned CPUs, a 2 GiB Node heap ceiling, Sharp concurrency limited to one by a temporary validation preload, thread pool size two, and `nice -n 10`; it exited successfully in 14:00.43 with peak RSS 786,284 KiB and zero swap. Its page build reused 939 generated cards and rendered zero new cards. Separate bounded measurements during the build investigation were about 4 seconds each for catalog and page generation. No persistent build optimization or dependency change was needed. The mitigation adds no build-time generation step; a before/after timing baseline was not captured, so this does not quantify a latency delta.

The 14-minute total is the complete build, tooling, backend, and browser release gate, not the page-build duration. It should not be interpreted as page generation taking 14 minutes.

With Sharp concurrency set to one, libuv thread pool to two, two-CPU affinity, and low process priority, `build:catalog` completed in about 4.04 seconds and `build:pages` in about 3.99 seconds. The page build reported **0 cards rendered, 939 reused**. The full release run also completed its build and deterministic-output checks. This establishes reproducibility under bounded resources; no permanent build-system optimization was needed, and mitigation code adds no page-generation work.

The twelve previously missing aliases (`about`, `collection`, `cookies`, `copyright`, `creator-standards`, `for-creators`, `help-center`, `privacy`, `show`, `submit`, `supporters`, and `terms`) now exist as generated `index.html` files. Generated-page integrity and the 2,493-file deterministic build check passed.

## Origin work and remaining 504 gap

The isolated routes serve catalogue HTML from loaded process state. A show-page render makes four synchronous SQLite review/score reads on an origin miss; public file revision stats are now rate-limited to one check per second per process. Edge caching can avoid that repeated work after a fill, but the first request for each unique page still reaches the application.

Local tests verified that a locked SQLite writer returns a bounded `503` while public/static reads remain responsive. This does not show that the historical `504` responses are fixed. Current evidence still cannot say whether those 504s came from Cloudflare, Caddy, Node, SQLite, or an upstream component.

For a later staging crawl, capture only the bounded fields needed to attribute failure: Cloudflare Ray ID, edge/origin status and origin time; Caddy status/upstream status and duration with a request ID; Node route/active-request/event-loop/RSS/restart metrics; and SQLite query-duration and busy/lock counts. Do not log raw IPs or retain full query strings for this purpose.

## Resource bounds and scope

The full local `npm run verify` run was limited to CPUs 0–1, `UV_THREADPOOL_SIZE=2`, one Sharp worker, `nice -n 10`, and a 2 GB Node heap ceiling. GNU `time` reported no swap use and a maximum RSS of approximately 643 MB for that verification run. No production load was generated and no production service was contacted by the load tests.
