#!/usr/bin/env bash
# Run litai at the exact revision CI uses, installing it first if needed.
#
#   scripts/litai.sh verify
#   scripts/litai.sh project test-receipt run-retained --project . --timeout-seconds 3600 _build/receipt.json
#   scripts/litai.sh            # install only, then print the litai path
#
# The pin is read from LITAI_SOURCE in .github/workflows/litai-verify.yml, so CI and
# this script cannot drift apart. litai is installed into .venv/litai (ignored by git).
# Set LITAI_VENV to use another location. litai runs from the repository root, so
# relative paths in its arguments are relative to the root.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workflow="$repo/.github/workflows/litai-verify.yml"
venv="${LITAI_VENV:-$repo/.venv/litai}"

source_spec="$(sed -n 's/^[[:space:]]*LITAI_SOURCE:[[:space:]]*//p' "$workflow" | head -n 1 | tr -d '"'"'"'')"
pin="${source_spec##*@}"
if [[ -z "$source_spec" || ! "$pin" =~ ^[0-9a-f]{40}$ ]]; then
  echo "litai.sh: could not read a pinned LITAI_SOURCE from $workflow" >&2
  exit 1
fi

installed_pin() {
  "$venv/bin/python" - <<'EOF' 2>/dev/null || true
import json
from importlib.metadata import distribution
info = json.loads(distribution("literate-ai").read_text("direct_url.json") or "{}")
print(info.get("vcs_info", {}).get("commit_id", ""))
EOF
}

find_python() {
  local candidate version
  for candidate in python3.13 python3.14 python3.12 python3.11 python3; do
    command -v "$candidate" >/dev/null 2>&1 || continue
    version="$("$candidate" -c 'import sys; print(sys.version_info >= (3, 11))' 2>/dev/null || true)"
    if [[ "$version" == "True" ]]; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

if [[ ! -x "$venv/bin/litai" || "$(installed_pin)" != "$pin" ]]; then
  echo "litai.sh: installing litai at ${pin:0:12} into $venv" >&2
  rm -rf "$venv"
  mkdir -p "$(dirname "$venv")"
  if python="$(find_python)"; then
    "$python" -m venv "$venv"
  elif command -v uv >/dev/null 2>&1; then
    # --seed adds pip; litai is installed with pip below, not uv.
    uv venv --quiet --seed --python 3.13 "$venv"
  else
    echo "litai.sh: litai needs Python 3.11 or newer. Install it (for example 'brew install python@3.13' or uv) and rerun." >&2
    exit 1
  fi
  # pip, not 'uv pip': litai's build backend requires a clean exact git checkout,
  # which pip's git clone provides and uv's cached checkout does not.
  "$venv/bin/python" -m pip install --quiet --disable-pip-version-check "$source_spec"
  if [[ "$(installed_pin)" != "$pin" ]]; then
    echo "litai.sh: installed litai does not match the pin ${pin:0:12}" >&2
    exit 1
  fi
fi

if [[ $# -eq 0 ]]; then
  echo "$venv/bin/litai"
  exit 0
fi
cd "$repo"
exec "$venv/bin/litai" "$@"
