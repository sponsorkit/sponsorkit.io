---
title: Versions & pinning
description: How the SDKs are versioned and released, how the wire protocol is versioned, and how to pin a version in each package manager.
order: 40
---

## How versions work

- **Each SDK has its own version**, released independently from this monorepo by pushing a tag named
  `sdks/<sdk>/v<version>`: `sdks/js/v0.1.0`, `sdks/dotnet/v0.1.0`, `sdks/python/v0.1.0`, `sdks/go/v0.1.0`,
  `sdks/rust/v0.1.0`. For the registry packages, the release workflow refuses a tag that doesn't match the
  version in the package manifest.
- **All five SDKs start at 0.1.0.** They follow semantic versioning, so while the major version is 0, a minor
  release (0.1 to 0.2) may contain breaking changes. Pin to a minor version, and check what changed before moving
  to the next one.
- **The HTTP API is versioned separately** under `/api/v1`. All SDK versions speak `v1`, and their behaviour is
  pinned by the shared conformance suite, so different SDKs (or SDK versions) agree on the result shape and the
  [stored state](supported-platforms.md#where-state-is-stored).
- **Registries publish through trusted publishing** (OIDC from GitHub Actions): npm, NuGet, PyPI and crates.io.
  Go needs no publish step; the module proxy picks up the tag.

## Pinning

The quickest safe choice is "this minor version, any patch". Lock files (`package-lock.json`, `packages.lock.json`,
`uv.lock`, `poetry.lock`, `go.sum`, `Cargo.lock`) then make builds reproducible.

### JavaScript {#javascript}

```bash title="Terminal"
npm install @sponsorkit/sdk@0.1.0 --save-exact   # exactly 0.1.0
```

In `package.json`, `"^0.1.0"` and `"~0.1.0"` both mean "0.1.x" for a 0.x version; `"0.1.0"` is exact. pnpm, Yarn
and Bun read the same ranges.

### .NET {#dotnet}

```xml title="MyApp.csproj"
<PackageReference Include="Sponsorkit" Version="[0.1.0]" />
```

A plain `Version="0.1.0"` is a minimum: NuGet resolves the lowest version that satisfies every constraint, so in
practice you get exactly 0.1.0 until you change it. Brackets make it an exact pin. Paket uses
`nuget Sponsorkit ~> 0.1.0` in `paket.dependencies` for "0.1.x".

### Python {#python}

```toml title="pyproject.toml"
dependencies = ["sponsorkit~=0.1.0"]   # >=0.1.0, <0.2
```

`sponsorkit==0.1.0` pins exactly. `sponsorkit.__version__` reports what is installed.

### Go {#go}

```bash title="Terminal"
go get github.com/sponsorkit/sponsorkit.io/sdks/go@v0.1.0
```

`go.mod` always records an exact version, and Go's minimal version selection never upgrades it on its own. The
tag in the repository is `sdks/go/v0.1.0` (Go's convention for a module in a subdirectory), but you ask for
`@v0.1.0`. Before the first tag, use a branch or commit: `@main` resolves to a pseudo-version.

### Rust {#rust}

```toml title="Cargo.toml"
[dependencies]
sponsorkit = "=0.1.0"   # exactly 0.1.0; "0.1" means >=0.1.0, <0.2.0
```

## Upgrading

The session token, cache and nag counters are stored in a versioned format (`"v": 1`) shared by every SDK. The
SDKs read stored documents leniently: a document or field they can't parse counts as absent (at worst the user
signs in again) instead of crashing your app.
