# Echo application deployment and rollback

## Targets

- planned deployment downtime: no more than 5 minutes;
- failed deployment plus automatic rollback: no more than 15 minutes;
- accepted user data loss during deploy/rollback: none.

`deploy/update-echo-archives.sh` is the only deployment implementation. It
fetches without changing the live checkout, validates the exact upstream
revision in a disposable Git worktree, installs its locked dependencies there,
and requires all candidate builds and tests to leave committed output clean.

Immediately before activation it creates and verifies an online SQLite backup.
Activation is a fast-forward of the clean live branch plus a same-filesystem
dependency-tree swap, followed by one Echo service restart. Caddy is not touched.
Candidate dependencies receive a read/traverse ACL for the dedicated
`echo-archives` runtime account before activation. After the swap and before
the restart, the deployment runs a dependency-resolution probe as that account;
a failure enters the same automatic rollback path.

## Automatic rollback boundary

If post-restart health fails, the script:

1. stops only `echo-archives.service`;
2. resets the still-clean live checkout to the recorded prior revision;
3. restores the prior `node_modules` tree;
4. starts Echo and requires health to pass.

The database is never rolled back. Accepted ratings, submissions, imports, and
moderation actions therefore remain. Every normal database change must remain
backward-compatible with the immediately prior application revision. Use
expand/contract migrations; a release that removes or reinterprets live schema
cannot use this automatic rollback path and needs its own reviewed maintenance
plan.

The script exits nonzero even when rollback succeeds so deployment automation
cannot mistake a recovered failed release for success.

## Manual recovery

The automatic path reports the exact previous and candidate revisions. If it
cannot recover, preserve logs and stop rather than restoring SQLite:

```bash
cd /home/charlie/The-Echo-Archives
git status --short
sudo systemctl stop echo-archives.service
git reset --hard <recorded-previous-revision>
# Restore the recorded previous dependency directory before continuing.
sudo systemctl start echo-archives.service
curl --fail --silent --show-error http://127.0.0.1:3010/api/health
```

Only use the hard reset when the deployment entry gate and current inspection
both prove the worktree has no unrelated changes.

## Acceptance drill

Before launch, exercise a deliberately unhealthy candidate in a disposable
deployment drill. Record:

- candidate and previous revisions;
- time from activation to detected failure;
- time from failure to recovered health;
- clean worktree after rollback;
- unchanged/newer counts for accepted user-write tables;
- cleanup of candidate worktree and failed dependency tree.

The drill requires systemd elevation and must not intentionally corrupt or
restore the production database.
