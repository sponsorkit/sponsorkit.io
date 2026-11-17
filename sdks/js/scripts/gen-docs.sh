#!/usr/bin/env bash
# API reference generator entrypoint for the JavaScript / TypeScript SDK (owner: lang-js).
#
# Contract: web/content/docs/REFERENCE-CONTRACT.md. Invoked by `bun run --cwd web docs:generate` as
#   bash scripts/gen-docs.sh <out-dir>          (cwd: sdks/js)
# with SPONSORKIT_DOCS_OUT=<out-dir>, SPONSORKIT_DOCS_LANG=js and SPONSORKIT_REPO_ROOT set.
#
# The generator (scripts/gen-docs.ts) reads src/ with the TypeScript compiler API, using the `typescript`
# dev dependency (run `bun install` at the repo root first). It needs no network and writes only to <out-dir>.
# Check the output with
#   bun run --cwd web docs:validate js --dir <out-dir>
set -euo pipefail

out="${1:-${SPONSORKIT_DOCS_OUT:-}}"
if [[ -z "$out" ]]; then
  echo "usage: gen-docs.sh <out-dir>" >&2
  exit 2
fi
mkdir -p "$out"
out="$(cd "$out" && pwd)"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -d "$here/../node_modules/typescript" && ! -d "$here/../../../node_modules/typescript" ]]; then
  echo "gen-docs: the typescript dev dependency is missing; run 'bun install' at the repository root" >&2
  exit 1
fi

if command -v bun >/dev/null 2>&1; then
  exec bun "$here/gen-docs.ts" "$out"
elif command -v node >/dev/null 2>&1; then
  # Node 22.6+ can run the generator with type stripping.
  exec node --experimental-strip-types --no-warnings "$here/gen-docs.ts" "$out"
else
  echo "gen-docs: needs bun or node (22.6+) on PATH" >&2
  exit 1
fi
