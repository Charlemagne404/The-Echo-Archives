# Traffic classification policy

Policy version: `traffic-classification-v1`. The classifier is deliberately explainable and conservative. It protects human-oriented analytics and popularity eligibility; it does not block public catalogue reads or claim to identify an operator.

| Class | Intended meaning | Signals and handling |
|---|---|---|
| `normal` | No strong automation pattern observed | Eligible by default. Ordinary multi-show browsing and low-volume visitors stay eligible. |
| `suspected_automation` | One or more weak indicators, insufficient for high confidence | Stored with reason codes; page views remain eligible by default. The class alone does not suppress legitimate signals. |
| `high_confidence_automated` | A combination of fast broad catalogue traversal and one-page session behavior indicates scripted browsing | Only implicated show-page views are made popularity-ineligible. Independent listening, save, rating and community actions remain unaffected. |

## Signals

- Rolling source request and event rates, bounded by HMAC-hashed source keys.
- Broad catalogue traversal within a rolling minute.
- Many distinct show IDs and many one-page sessions in the same source/time bucket.
- An unusually high one-page-session ratio combined with traversal signals.
- UA bot/headless/scripting terms as a suspicion signal only. A Googlebot-like string cannot establish that the request is a verified search crawler; low-volume crawler-labeled traffic remains eligible, and combined broad-traversal/session evidence still applies.
- Available Cloudflare metadata may be added later only after validating provenance and privacy. The current application classifier does not trust client-provided Cloudflare headers unless they are supplied by the configured trusted proxy chain.

Identifier churn alone does not trigger a classification. Low engagement alone does not trigger a classification. A single low-volume visitor can browse several shows without being treated as automated. The application currently receives no trusted verified-bot signal, so user-agent claims are never whitelisted; no crawler is blocked or challenged, and public indexing behavior is unchanged. No invasive browser fingerprinting or account requirement is introduced.

## Bounded controls

The source map is capped, client tokens are normalized but never treated as evidence of humanity, and server receipt time drives classification buckets. Per-source limits and a process-wide event limit prevent unlimited writes when sources or anonymous IDs rotate. Source limits can group legitimate users behind NAT; diagnostics should be reviewed before any threshold change. A process restart resets in-memory counters; persisted event classes remain.

## Review and reversibility

Classification reason codes, policy version, class and initial eligibility are stored per event. A maintainer-only authenticated endpoint accepts an explicit event ID, eligibility boolean, reason and optional traffic class. Every change adds an audit row and adjusts only the eligibility rollup; setting the event eligible again reverses the adjustment. A human review is required before historical rows are quarantined. No raw analytics row is deleted.

## Diagnostics

Internal analytics diagnostics separate raw requests/events, normal, suspected and high-confidence event/page-view counts, popularity-eligible counts, legacy-unclassified records, and guard counters. Treat browser identifiers/sessions as anonymous pseudonyms, not unique people. Passive impressions are reported separately and do not qualify as meaningful engagement.
