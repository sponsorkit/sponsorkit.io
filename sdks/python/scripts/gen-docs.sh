#!/usr/bin/env bash
# API reference generator entrypoint for the Python SDK (owner: lang-python).
#
# Contract: web/content/docs/REFERENCE-CONTRACT.md. Invoked by `bun run --cwd web docs:generate` as
#   bash scripts/gen-docs.sh <out-dir>          (cwd: sdks/python)
# with SPONSORKIT_DOCS_OUT=<out-dir>, SPONSORKIT_DOCS_LANG=python and SPONSORKIT_REPO_ROOT set.
#
# The generator (scripts/gen_reference.py) imports the package from src/ and reads its signatures,
# docstrings and attribute docstrings with the standard library only (inspect + ast). It needs
# Python 3.10+; httpx is used if installed and replaced by a placeholder otherwise (no HTTP calls
# are made). Output is deterministic. Check it with
#   bun run --cwd web docs:validate python --dir <out-dir>
set -euo pipefail

out="${1:-${SPONSORKIT_DOCS_OUT:-}}"
if [[ -z "$out" ]]; then
  echo "usage: gen-docs.sh <out-dir>" >&2
  exit 2
fi
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sdk="$(cd "$here/.." && pwd)"

# Interpreter: $PYTHON, then the SDK's virtualenv, then python3 on PATH.
py="${PYTHON:-}"
if [[ -z "$py" ]]; then
  if [[ -x "$sdk/.venv/bin/python" ]]; then
    py="$sdk/.venv/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    py="python3"
  else
    echo "gen-docs.sh: Python 3.10+ is required (set \$PYTHON or create sdks/python/.venv)" >&2
    exit 1
  fi
fi
if ! "$py" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
  echo "gen-docs.sh: $py is older than Python 3.10" >&2
  exit 1
fi

mkdir -p "$out"
# -B: never write __pycache__ next to the sources (the script must only write inside <out-dir>).
PYTHONDONTWRITEBYTECODE=1 "$py" -B "$here/gen_reference.py" "$out"
