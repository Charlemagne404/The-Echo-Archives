# TODO — 1.0 follow-up

## Data Cleanup

- 2026-08-18: The 1.0 catalog snapshot contains 724 published shows, 523 Imported records, 194 indexed-only records, 7 full reviews, and 38 collections. The report still blocks on undocumented runtime gaps for `big-grande-teachers-lounge` and `machina`; resolve them with evidence or explicit `metadata.researchGaps` notes.
- 2026-08-18: The previous RSS audit remains valid for `impact-winter`, `homecoming`, `earth-eclipsed`, `the-rapscallion-agency`, and `the-invenios-expeditions`; the current report documents three missing RSS links and three runtime unknowns. Do not describe the catalog gate as complete until the two current blockers are closed.

## Legal and privacy follow-ups

- 2026-08-20 TODO: Verify the production host is running the new SQLite retention cleanup and confirm the installed local/off-site backup retention schedule. Update the Privacy page if the host differs from the checked-in workflow.
- 2026-08-20 TODO: Confirm with qualified Swedish/EU counsel whether the controller needs a published postal address, DPO details, representative, or any additional jurisdiction-specific notice. Do not invent those details.
- 2026-08-20 TODO: Confirm the production Cloudflare Challenge Passage and Turnstile settings from the account/host configuration; the public policy intentionally avoids claiming a fixed challenge lifetime or that Turnstile is active.
- 2026-08-20 TODO: Confirm the production build keeps `PLAUSIBLE_DOMAIN` unset while analytics is disabled. If Plausible or another processor is enabled, update Privacy/Cookies before deployment.
- 2026-08-20 TODO: Reassess whether any jurisdiction requires a designated copyright agent or statutory notice process before adding one to the voluntary rights-request page.

Use:

- `docs/ROADMAP.md` for planned product and platform work
- `HANDOFF.md` for in-flight task context
- this file for small discovered follow-ups that are worth keeping visible but do not belong in the main roadmap
