#!/usr/bin/env bash
# Mode L (loopback) server for the multi-workspace test: production build, bound to 127.0.0.1 only,
# with open workspace creation (synthetic data only). Usage: scripts/serve.sh <port>
set -euo pipefail
PORT="${1:?usage: scripts/serve.sh <port>}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "serve.sh: port must be a number" >&2; exit 2; }
[ "${ALIGN_PUBLIC:-}" = 1 ] && { echo "serve.sh: public mode is not supported in this build" >&2; exit 2; }
cd "$(dirname "$0")/.."
npx next build
ALIGN_ALLOW_OPEN_CREATE=1 exec npx next start -H 127.0.0.1 -p "$PORT"
