# TODO — 1.0 follow-up

## Data Cleanup

- 2026-08-18: The 1.0 catalog snapshot contains 724 published shows, 523 Imported records, 194 indexed-only records, 7 full reviews, and 38 collections. The report still blocks on undocumented runtime gaps for `big-grande-teachers-lounge` and `machina`; resolve them with evidence or explicit `metadata.researchGaps` notes.
- 2026-08-18: The previous RSS audit remains valid for `impact-winter`, `homecoming`, `earth-eclipsed`, `the-rapscallion-agency`, and `the-invenios-expeditions`; the current report documents three missing RSS links and three runtime unknowns. Do not describe the catalog gate as complete until the two current blockers are closed.
- 2026-08-18: Repository structure checking is currently blocked by `shared/styles/home/cards/17-responsive-780-a.css` exceeding the hard line limit by one line. This is separate from the docs pass and should be resolved with the related UI work.

Use:

- `docs/ROADMAP.md` for planned product and platform work
- `HANDOFF.md` for in-flight task context
- this file for small discovered follow-ups that are worth keeping visible but do not belong in the main roadmap
