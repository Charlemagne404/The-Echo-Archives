#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Compatibility entry point retained for operators who used the old filename.
# Host setup is deliberately separate from release selection and never starts
# or restarts Echo, changes Caddy, or enables a timer implicitly.
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
exec "${SCRIPT_ROOT}/bootstrap-echo-archives.sh" "$@"
