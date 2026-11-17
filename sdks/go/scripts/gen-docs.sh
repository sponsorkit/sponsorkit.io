#!/usr/bin/env bash
# API reference generator entrypoint for the Go SDK (owner: lang-go).
#
# Contract: web/content/docs/REFERENCE-CONTRACT.md. Invoked by `bun run --cwd web docs:generate` as
#   bash scripts/gen-docs.sh <out-dir>          (cwd: sdks/go)
# with SPONSORKIT_DOCS_OUT=<out-dir>, SPONSORKIT_DOCS_LANG=go and SPONSORKIT_REPO_ROOT set.
#
# The generator lives in scripts/gendocs, a separate Go module (standard library only: go/doc and
# go/doc/comment), so it is not part of the published github.com/sponsorkit/sponsorkit.io/sdks/go
# module. It needs no network access. It writes _meta.json, index.md, one page per exported type,
# functions.md and constants.md into <out-dir>. Check the output with
#   bun run --cwd web docs:validate go --dir <out-dir>
set -euo pipefail

out="${1:-${SPONSORKIT_DOCS_OUT:-}}"
if [[ -z "$out" ]]; then
  echo "usage: gen-docs.sh <out-dir>" >&2
  exit 2
fi
if ! command -v go >/dev/null 2>&1; then
  echo "gen-docs.sh: the Go toolchain (go 1.23 or later) is required but 'go' is not on PATH" >&2
  exit 1
fi

sdk_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$out"
out="$(cd "$out" && pwd)"

# The build cache is the only thing written outside <out-dir>; keep it in a temporary directory when
# the default one is not writable (for example in a read-only CI home).
if ! gocache="$(go env GOCACHE 2>/dev/null)" || [[ -z "$gocache" ]] || ! mkdir -p "$gocache" 2>/dev/null || [[ ! -w "$gocache" ]]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  export GOCACHE="$tmp/gocache"
fi

cd "$sdk_dir/scripts/gendocs"
GOWORK=off GOFLAGS=-mod=mod go run . -src "$sdk_dir" -out "$out" -source-prefix sdks/go
