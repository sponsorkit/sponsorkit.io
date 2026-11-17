#!/usr/bin/env bash
# API reference generator entrypoint for the .NET SDK (owner: lang-dotnet).
#
# Contract: web/content/docs/REFERENCE-CONTRACT.md. Invoked by `bun run --cwd web docs:generate` as
#   bash scripts/gen-docs.sh <out-dir>          (cwd: sdks/dotnet)
# with SPONSORKIT_DOCS_OUT=<out-dir>, SPONSORKIT_DOCS_LANG=dotnet and SPONSORKIT_REPO_ROOT set.
#
# How it works: scripts/docgen is a small console app (not part of Sponsorkit.slnx, never packed) that
# references src/Sponsorkit, loads the net8.0 build with reflection for exact signatures, and turns the
# compiler's XML documentation file into one Markdown page per public type plus index.md and _meta.json.
# Everything is built into a temporary directory (--artifacts-path), so nothing is written to the repository
# or anywhere except <out-dir>. Needs the .NET 8+ SDK (net10.0 for the tool) and the NuGet packages the SDK
# already restores. Check the output with
#   bun run --cwd web docs:validate dotnet --dir <out-dir>
set -euo pipefail

out="${1:-${SPONSORKIT_DOCS_OUT:-}}"
if [[ -z "$out" ]]; then
  echo "usage: gen-docs.sh <out-dir>" >&2
  exit 2
fi
mkdir -p "$out"
out="$(cd "$out" && pwd)"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="${SPONSORKIT_REPO_ROOT:-$(cd "$here/../../.." && pwd)}"

if ! command -v dotnet >/dev/null 2>&1; then
  echo "gen-docs (dotnet): the dotnet SDK is not on PATH" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
if ! dotnet build "$here/docgen/DocGen.csproj" -c Release --artifacts-path "$tmp/artifacts" \
    -p:ContinuousIntegrationBuild=true -nologo -v:quiet -clp:ErrorsOnly >"$tmp/build.log" 2>&1; then
  cat "$tmp/build.log" >&2
  echo "gen-docs (dotnet): building the generator failed" >&2
  exit 1
fi

dll="$(find "$tmp/artifacts/bin/DocGen" -name DocGen.dll -print -quit)"
if [[ -z "$dll" ]]; then
  echo "gen-docs (dotnet): DocGen.dll not found after the build" >&2
  exit 1
fi
dotnet "$dll" "$out" "$root"
