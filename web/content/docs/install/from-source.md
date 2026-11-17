---
title: Build from source
description: Use an unreleased SDK from the sponsorkit.io monorepo, directly from Git where the package manager supports it, or from a local build.
order: 50
---

All five SDKs live in one repository, [sponsorkit/sponsorkit.io](https://github.com/sponsorkit/sponsorkit.io),
under `sdks/<language>/`. Use this page before the first release reaches a registry, or to try a change that
isn't released yet.

How easy that is depends on the package manager:

| Language | Straight from Git | From a local checkout |
|---|---|---|
| JavaScript | No: the package must be built first | `npm pack` tarball |
| .NET | No | `dotnet pack` into a local package folder |
| Python | Yes, with a subdirectory | Path install |
| Go | Yes: Go modules are fetched from Git | `replace` directive |
| Rust | Yes: Cargo finds the crate in the repository | Path dependency |

Every recipe below was tested against the repository's `main` branch.

## JavaScript {#javascript}

npm, pnpm and Yarn can install from Git, but not this package: its compiled `dist/` folder isn't committed,
and the SDK is a member of a Bun workspace whose development dependencies use the `workspace:` protocol.
Build it once and install the tarball instead. You need [Bun](https://bun.sh) to build.

```bash title="Terminal"
git clone https://github.com/sponsorkit/sponsorkit.io.git
cd sponsorkit.io
bun install
bun run --cwd sdks/js build
cd sdks/js && npm pack          # writes sponsorkit-sdk-0.1.0.tgz
```

Then, in your project:

```bash title="Terminal"
npm install /path/to/sponsorkit.io/sdks/js/sponsorkit-sdk-0.1.0.tgz
```

The tarball is exactly what `npm publish` would upload, so imports, types and entry points behave like the
released package. pnpm, Yarn and Bun accept the same path. Commit the tarball, or rebuild it in CI, if your
teammates need it too.

## .NET {#dotnet}

Pack the library into a folder and use that folder as a package source:

```bash title="Terminal"
git clone https://github.com/sponsorkit/sponsorkit.io.git
dotnet pack sponsorkit.io/sdks/dotnet/src/Sponsorkit -c Release -o ~/local-nuget -p:Version=0.1.0-local.1

cd my-app
dotnet add package Sponsorkit --version 0.1.0-local.1 --source ~/local-nuget
```

Give each local build its own version, as with `-p:Version` above. NuGet caches packages by id and version
in `~/.nuget/packages`, so rebuilding under the same version keeps serving the old build. For a team or CI,
add the folder to a `nuget.config` instead of passing `--source`:

```xml title="nuget.config"
<configuration>
  <packageSources>
    <add key="sponsorkit-local" value="./local-nuget" />
  </packageSources>
</configuration>
```

## Python {#python}

pip, uv and Poetry install straight from Git when you name the subdirectory:

:::tabs{group="pypi"}
```bash tab="pip" key="pip"
python -m pip install "sponsorkit @ git+https://github.com/sponsorkit/sponsorkit.io@main#subdirectory=sdks/python"
```

```bash tab="uv" key="uv"
uv add "sponsorkit @ git+https://github.com/sponsorkit/sponsorkit.io#subdirectory=sdks/python"
```

```bash tab="Poetry" key="poetry"
poetry add "git+https://github.com/sponsorkit/sponsorkit.io.git#subdirectory=sdks/python"
```

```bash tab="Local checkout" key="local"
python -m pip install ./sponsorkit.io/sdks/python        # or -e for an editable install
```
:::

uv records the source under `[tool.uv.sources]` and pins the commit in `uv.lock`; Poetry pins it in
`poetry.lock`. Replace `main` with a tag or commit hash to pin it yourself.

## Go {#go}

Nothing special: Go modules are fetched from the repository. Before the first `sdks/go/v…` tag exists, ask for a
branch or a commit and Go records a pseudo-version:

```bash title="Terminal"
go get github.com/sponsorkit/sponsorkit.io/sdks/go@main
```

To work against a local checkout, add a `replace` directive to your `go.mod`:

```text title="go.mod"
require github.com/sponsorkit/sponsorkit.io/sdks/go v0.0.0

replace github.com/sponsorkit/sponsorkit.io/sdks/go => ../sponsorkit.io/sdks/go
```

## Rust {#rust}

Cargo searches a Git repository for the crate by name, so the subdirectory doesn't need to be named:

```toml title="Cargo.toml"
[dependencies]
sponsorkit = { git = "https://github.com/sponsorkit/sponsorkit.io", branch = "main" }
# or, from a local checkout:
# sponsorkit = { path = "../sponsorkit.io/sdks/rust" }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

`Cargo.lock` pins the exact commit. Use `rev = "<commit>"` or `tag = "sdks/rust/v0.1.0"` instead of `branch`
to pin it in `Cargo.toml`. Crates.io doesn't accept Git dependencies, so switch to a version requirement before
you publish a crate that depends on Sponsorkit.

## Running the SDK tests

Each SDK has its own test suite, and all of them run the shared conformance scenarios against a fake API
server, so you don't need network access or real accounts. From the repository root, run `bun install`
first; the conformance server is written in TypeScript. The exact commands per SDK are in
[`.github/workflows/ci.yml`](https://github.com/sponsorkit/sponsorkit.io/blob/main/.github/workflows/ci.yml).
