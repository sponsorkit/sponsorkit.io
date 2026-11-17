#!/usr/bin/env bash
# API reference generator entrypoint for the Rust SDK (owner: lang-rust).
#
# Contract: web/content/docs/REFERENCE-CONTRACT.md. Invoked by `bun run --cwd web docs:generate` as
#   bash scripts/gen-docs.sh <out-dir>          (cwd: sdks/rust)
# with SPONSORKIT_DOCS_OUT=<out-dir>, SPONSORKIT_DOCS_LANG=rust and SPONSORKIT_REPO_ROOT set.
#
# The generator is a small standalone Rust program in scripts/docgen/ (its own Cargo.lock, not part of the
# published crate: Cargo.toml's `include` only ships src/). It parses src/ with `syn`, follows the public
# re-exports in lib.rs and the public modules, and writes one Markdown page per public type plus a page per
# module with its functions and constants. It works on stable Rust (no rustdoc JSON) and is deterministic.
#
# Build output goes to a temporary directory, so nothing is written outside <out-dir>. To reuse a build
# between runs, set SPONSORKIT_DOCGEN_TARGET_DIR to a directory of your choice.
#
# Check the output with
#   bun run --cwd web docs:validate rust --dir <out-dir>
set -euo pipefail

out="${1:-${SPONSORKIT_DOCS_OUT:-}}"
if [[ -z "$out" ]]; then
  echo "usage: gen-docs.sh <out-dir>" >&2
  exit 2
fi
mkdir -p "$out"
out="$(cd "$out" && pwd)"

if ! command -v cargo >/dev/null 2>&1; then
  echo "gen-docs.sh: cargo is required (install Rust from https://rustup.rs)" >&2
  exit 1
fi

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
crate_dir="$(cd "$here/.." && pwd)"

if [[ -n "${SPONSORKIT_DOCGEN_TARGET_DIR:-}" ]]; then
  target_dir="$SPONSORKIT_DOCGEN_TARGET_DIR"
else
  target_dir="$(mktemp -d)"
  trap 'rm -rf "$target_dir"' EXIT
fi

CARGO_TARGET_DIR="$target_dir" cargo run --quiet --locked \
  --manifest-path "$here/docgen/Cargo.toml" -- \
  "$crate_dir" "$out" "sdks/rust"
