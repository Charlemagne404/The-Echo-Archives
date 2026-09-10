#!/usr/bin/env bash
set -Eeuo pipefail

cat >&2 <<'EOF'
Direct production checkout updates are disabled.

Use the release workflow instead:
  ./deploy/echo staging <commit-or-ref>
  ./deploy/echo smoke
  ./deploy/echo promote

For an already-built release rollback:
  ./deploy/echo rollback

This compatibility entry point intentionally performs no Git operation,
dependency installation, service restart, Caddy reload, or production deploy.
EOF
exit 2
