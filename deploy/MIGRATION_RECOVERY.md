# Migration recovery boundary

This note is intentionally separate from the normal release workflow.

The frozen checkout at `/home/charlie/The-Echo-Archives` and the migration
preflight/adoption evidence are recovery material only. A normal release does
not read, write, reset, clean, pull, stash, or deploy from that checkout.

The only migration-specific commands retained in the release tool are:

- `./deploy/echo preflight`, which records read-only evidence about the old
  running checkout; and
- `./deploy/echo adopt-current <sha>`, which is a one-time cutover/recovery
  operation and refuses to run without matching preflight evidence.

Do not use those commands for future releases. Future releases use the normal
exact-SHA sequence in `RELEASE_WORKFLOW.md`: build and test staging, promote
the same tested artifact, and use `rollback` for code recovery.

Historical Restic markers that point at the old checkout remain selectable by
the recovery snapshot tool. New off-site backups use the release-backed
expanded inventory and do not depend on that path.
