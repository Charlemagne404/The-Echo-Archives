# TODO — 1.0 follow-up

## Data Cleanup

- 2026-08-20 COMPLETE — The Big Grande audit now uses the current official RSS, Apple, and website sources and records verified observed runtime data. Machina retains an evidence-backed `metadata.researchGaps` note because the current feed exposes only a 61-second trailer and no full episodes. The catalog report is green with zero blocking errors and zero actionable RSS gaps. See [the dated QA/evidence record](docs/qa/2026-08-20-1.0-todo-evidence.md).
- 2026-08-20 COMPLETE — The previous RSS audit remains unchanged for `impact-winter`, `homecoming`, `earth-eclipsed`, `the-rapscallion-agency`, and `the-invenios-expeditions`. The three missing RSS links and the documented runtime unknowns remain explicit; no ambiguous or shared RSS identity was restored. See [the dated QA/evidence record](docs/qa/2026-08-20-1.0-todo-evidence.md).

## Legal and privacy follow-ups

- 2026-09-08 REASSESSED — The proportionate legal review now separates concrete requirements, conditional questions, best practices, and speculative issues. It keeps only deployment parity as a confirmed critical gate; DPO and EU-representative items are no longer blockers on the current facts. See [the dated legal review](docs/qa/2026-09-07-legal-review.md).
- 2026-09-08 DEPLOYMENT PARITY REQUIRED — The public deployment still shows the older `v1.0.2`/August 20, 2026 legal surfaces; the September 8, 2026 source and generated-page changes in this worktree have not been deployed. Recheck all live legal routes after an authorized deployment.
- 2026-09-08 IMPORTANT PROVENANCE — New importer records now receive lightweight source/artwork/description provenance. Existing catalogue records remain intact and are reported as legacy/unknown until evidence is added; continue enrichment without treating missing provenance alone as a publication blocker.
- 2026-09-08 FOLLOW-UP PROVIDER EVIDENCE — Verify production Cloudflare, host-log, backup, Turnstile/RUM, processor-contract, retention, and transfer settings from operator records. Unknown physical backup regions alone are not a critical blocker; reclassify any concrete mismatch with the legal notice or transfer safeguards.
- 2026-09-08 FOLLOW-UP OPERATOR SCOPE — Decide whether Swedish Electronic Commerce Act section 8 applies to the actual operator/service model. If it does, provide an approved service/contact address; do not publish a private residential address or invent organisation/VAT details.
- 2026-08-20 HISTORICAL EVIDENCE — The checked-in retention and backup workflow remains documented, including SQLite cleanup, local completed backups, Restic retention, restore verification, integrity checks, and a freshness marker. Production host logs, service/timer state, permissions, and a successful off-site restore drill remain operational follow-ups. See [the dated QA/evidence record](docs/qa/2026-08-20-1.0-todo-evidence.md).

Use:

- `docs/ROADMAP.md` for planned product and platform work
- `HANDOFF.md` for in-flight task context
- this file for small discovered follow-ups that are worth keeping visible but do not belong in the main roadmap
