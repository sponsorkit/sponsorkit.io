---
title: Install
description: Packages, supported runtimes and how to add Sponsorkit to your project, plus what to do before the packages are published.
sidebar_label: Overview
---

Every SDK is one package with the same behaviour and the same result shape. Pick yours:

| Language | Package | Runtime | Dependencies |
|---|---|---|---|
| JavaScript / TypeScript | `@sponsorkit/sdk` | Node 20+, Bun, Deno, evergreen browsers | None |
| .NET | `Sponsorkit` | `netstandard2.0` and `net8.0` builds | `System.Text.Json` (netstandard2.0 only) |
| Python | `sponsorkit` | Python 3.10+ | `httpx` |
| Go | `github.com/sponsorkit/sponsorkit.io/sdks/go` | Go 1.23+ | Standard library only |
| Rust | `sponsorkit` | Rust 1.85+ (MSRV), Tokio | `reqwest` (rustls), `serde`, `tokio` |

Rust apps also need a Tokio runtime, for example `cargo add tokio --features macros,rt-multi-thread`.

:::danger[Not on npm, NuGet, PyPI or crates.io yet]
No Sponsorkit SDK has been released yet. `@sponsorkit/sdk`, `Sponsorkit` and `sponsorkit` are **not** on npm,
NuGet, PyPI or crates.io, and some of those names aren't reserved yet, so a package someone else publishes
under that name would not be this project. Until the first release is announced in the
[repository](https://github.com/sponsorkit/sponsorkit.io), install from Git or from a local build as shown below,
and don't install these names from a registry.
:::

## Install from the repository

Go fetches the module straight from GitHub. Python and Rust can depend on the Git repository directly.
JavaScript and .NET need a local build first. [Build from source](from-source.md) explains each recipe.

:::tabs
```bash tab="JavaScript" key="js"
git clone https://github.com/sponsorkit/sponsorkit.io.git
(cd sponsorkit.io && bun install && bun run --cwd sdks/js build && cd sdks/js && npm pack)
npm install ./sponsorkit.io/sdks/js/sponsorkit-sdk-0.1.0.tgz
```

```bash tab=".NET" key="dotnet"
git clone https://github.com/sponsorkit/sponsorkit.io.git
dotnet pack sponsorkit.io/sdks/dotnet/src/Sponsorkit -c Release -o ~/local-nuget -p:Version=0.1.0-local.1
dotnet add package Sponsorkit --version 0.1.0-local.1 --source ~/local-nuget
```

```bash tab="Python" key="python"
python -m pip install "sponsorkit @ git+https://github.com/sponsorkit/sponsorkit.io@main#subdirectory=sdks/python"
```

```bash tab="Go" key="go"
go get github.com/sponsorkit/sponsorkit.io/sdks/go@main
```

```bash tab="Rust" key="rust"
cargo add sponsorkit --git https://github.com/sponsorkit/sponsorkit.io
```
:::

Building the JavaScript SDK needs [Bun](https://bun.sh). Run the .NET `dotnet add package` line in your
project's folder.

## After the first release

Once a release is published to the registries, these are the commands to use instead. They fail with "not
found" today; see the warning above.

:::tabs
```bash tab="JavaScript" key="js"
npm install @sponsorkit/sdk
```

```bash tab=".NET" key="dotnet"
dotnet add package Sponsorkit
```

```bash tab="Python" key="python"
pip install sponsorkit
```

```bash tab="Go" key="go"
go get github.com/sponsorkit/sponsorkit.io/sdks/go
```

```bash tab="Rust" key="rust"
cargo add sponsorkit
```
:::

## In this section

- [Package managers & CDNs](package-managers.md): npm, pnpm, Yarn, Bun, Deno and browser CDNs; `dotnet`,
  `PackageReference` and Paket; pip, uv and Poetry; Go modules; Cargo.
- [Supported platforms](supported-platforms.md): runtime versions, sign-in methods and where state is stored on
  each operating system.
- [Verify the install](verify.md): print the installed version and run a smoke test without signing in.
- [Versions & pinning](versions.md): how SDK versions and release tags work, and how to pin one.
- [Build from source](from-source.md): use an unreleased version from this monorepo.

Once installed, continue with the [quickstart](../getting-started/quickstart.md).
