# TODO — 1.0 follow-up

## Data Cleanup

- 2026-08-20 COMPLETE — The Big Grande audit now uses the current official RSS, Apple, and website sources and records verified observed runtime data. Machina retains an evidence-backed `metadata.researchGaps` note because the current feed exposes only a 61-second trailer and no full episodes. The catalog report is green with zero blocking errors and zero actionable RSS gaps. See [the dated QA/evidence record](docs/qa/2026-08-20-1.0-todo-evidence.md).
- 2026-08-20 COMPLETE — The previous RSS audit remains unchanged for `impact-winter`, `homecoming`, `earth-eclipsed`, `the-rapscallion-agency`, and `the-invenios-expeditions`. The three missing RSS links and the documented runtime unknowns remain explicit; no ambiguous or shared RSS identity was restored. See [the dated QA/evidence record](docs/qa/2026-08-20-1.0-todo-evidence.md).

## Legal and privacy follow-ups

- 2026-08-20 PENDING OPERATOR EVIDENCE — The checked-in retention and backup workflow is documented, including SQLite cleanup, local completed backups (30 days with a minimum of 7), Restic retention (7 daily, 5 weekly, 12 monthly, 2 yearly), restore verification, integrity checks, and the freshness marker. Production host logs, service/timer state, permissions, and a successful off-site restore drill are still required before closure. See [the dated QA/evidence record](docs/qa/2026-08-20-1.0-todo-evidence.md).
- 2026-08-20 PENDING COUNSEL DECISION — Swedish/EU counsel must decide whether a postal address, DPO details, representative, or jurisdiction-specific notices are required. No details have been invented in the policy sources. See [the counsel brief and decision checklist](docs/qa/2026-08-20-1.0-todo-evidence.md).
- 2026-08-20 PENDING PROVIDER/HOST EVIDENCE — The production Cloudflare Challenge Passage value, Turnstile enablement and site-key mapping, Cloudflare RUM status, and actual rating-write configuration must be confirmed from account/host configuration without recording secrets. The public policy remains intentionally non-specific.
- 2026-08-20 LOCAL CHECK COMPLETE; PENDING PRODUCTION EVIDENCE — `PLAUSIBLE_DOMAIN` is unset in the checked-in local environment and generated public HTML contains no Plausible script. Production environment and deployed HTML still need confirmation; any other active analytics processor requires a Privacy/Cookies review and consent decision before deployment.
- 2026-08-20 PENDING COUNSEL/JURISDICTION DECISION — Counsel must confirm whether any jurisdiction requires a designated copyright agent or statutory notice process. Until then, the public page remains a voluntary rights-request workflow and makes no statutory-agent or DMCA-process claim.

Use:

- `docs/ROADMAP.md` for planned product and platform work
- `HANDOFF.md` for in-flight task context
- this file for small discovered follow-ups that are worth keeping visible but do not belong in the main roadmap
