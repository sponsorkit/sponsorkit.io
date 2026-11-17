---
title: Package managers & CDNs
description: Every way to add a Sponsorkit SDK to a project, per language and package manager, including browser imports from a CDN.
sidebar_label: Package managers
order: 10
---

Each section below covers one language. The commands assume a published release.

:::danger[Not released yet]
No Sponsorkit SDK is on npm, NuGet, PyPI or crates.io yet (Go modules are fetched from GitHub and work
today). Some of these package names aren't reserved yet, so a package someone else publishes under them would
not be this project. Until the first release is announced in the
[repository](https://github.com/sponsorkit/sponsorkit.io), use [build from source](from-source.md) instead of
the registry commands on this page.
:::

## JavaScript / TypeScript {#javascript}

One package, `@sponsorkit/sdk`, with no runtime dependencies. It ships ESM and CommonJS builds and its own
TypeScript types, so there is no `@types` package to add.

:::tabs{group="pm"}
```bash tab="npm" key="npm"
npm install @sponsorkit/sdk
```

```bash tab="pnpm" key="pnpm"
pnpm add @sponsorkit/sdk
```

```bash tab="Yarn" key="yarn"
yarn add @sponsorkit/sdk
```

```bash tab="Bun" key="bun"
bun add @sponsorkit/sdk
```

```bash tab="Deno" key="deno"
deno add npm:@sponsorkit/sdk
```
:::

Import from the entry point that matches where your code runs:

| Entry point | For | Sign-in | Storage |
|---|---|---|---|
| `@sponsorkit/sdk` | Browsers (and any runtime in mock mode) | Popup, redirect fallback | `localStorage` |
| `@sponsorkit/sdk/node` | Node, Bun, Deno: CLIs and desktop apps | Loopback, paste-back | Per-user config directory |
| `@sponsorkit/sdk/server` | Backends and Cloudflare Workers | None: `verifySession()` only | None |
| `@sponsorkit/sdk/elements` | Plain HTML pages | `<sponsorkit-button>`, `<sponsorkit-badge>` | `localStorage` |

The `node` entry uses Node built-ins (`node:http`, `node:fs`, `node:child_process`), so under Deno it asks for
network, environment, file and subprocess permissions. Deno can also import it without `deno add`:
`import { Sponsorkit } from "npm:@sponsorkit/sdk@0.1.0/node";`.

### Browsers without a bundler {#cdn}

The browser entry points only import their own files, so a CDN that mirrors npm can serve them as native ES
modules. Pin an exact version in the URL:

:::tabs{group="cdn"}
```html tab="esm.sh" key="esm-sh"
<script type="module">
  import { Sponsorkit } from "https://esm.sh/@sponsorkit/sdk@0.1.0";

  const sk = new Sponsorkit({ github: "octocat", opencollective: "my-collective" });
  const fc = await sk.getFinancialContribution();
  if (fc.active().length === 0) document.querySelector("#sponsor-banner").hidden = false;
  document.querySelector("#sign-in").onclick = () => sk.signIn(); // popup: call it from the click
</script>
```

```html tab="jsDelivr" key="jsdelivr"
<script type="module">
  import { Sponsorkit } from "https://cdn.jsdelivr.net/npm/@sponsorkit/sdk@0.1.0/dist/index.js";

  const sk = new Sponsorkit({ github: "octocat", opencollective: "my-collective" });
  const fc = await sk.getFinancialContribution();
  if (fc.active().length === 0) document.querySelector("#sponsor-banner").hidden = false;
  document.querySelector("#sign-in").onclick = () => sk.signIn(); // popup: call it from the click
</script>
```
:::

The web components register themselves when their module loads:

```html title="index.html"
<script type="module" src="https://cdn.jsdelivr.net/npm/@sponsorkit/sdk@0.1.0/dist/elements.js"></script>

<sponsorkit-button github="octocat" amount="500" frequency="monthly">Sponsor</sponsorkit-button>
<sponsorkit-badge github="octocat"></sponsorkit-badge>
```

With esm.sh, the same module is `https://esm.sh/@sponsorkit/sdk@0.1.0/elements`. CDNs only serve published
versions; until the first npm release, bundle a local build instead.

## .NET {#dotnet}

The `Sponsorkit` NuGet package targets `netstandard2.0` and `net8.0`. On .NET 8 and later it has no dependencies;
the `netstandard2.0` build depends on `System.Text.Json`.

:::tabs{group="nuget"}
```bash tab=".NET CLI" key="dotnet-cli"
dotnet add package Sponsorkit
```

```xml tab="PackageReference" key="packagereference"
<ItemGroup>
  <PackageReference Include="Sponsorkit" Version="0.1.0" />
</ItemGroup>
```

```xml tab="Central Package Management" key="cpm"
<!-- Directory.Packages.props -->
<ItemGroup>
  <PackageVersion Include="Sponsorkit" Version="0.1.0" />
</ItemGroup>

<!-- your .csproj -->
<ItemGroup>
  <PackageReference Include="Sponsorkit" />
</ItemGroup>
```

```bash tab="Paket" key="paket"
dotnet paket add Sponsorkit --project src/MyApp/MyApp.csproj
```
:::

Everything lives in the `Sponsorkit` namespace; the client class is `SponsorkitClient`.

## Python {#python}

The `sponsorkit` distribution supports Python 3.10 and later and depends only on `httpx`. It ships type hints
(`py.typed`).

:::tabs{group="pypi"}
```bash tab="pip" key="pip"
python -m pip install sponsorkit
```

```bash tab="uv" key="uv"
uv add sponsorkit
```

```bash tab="Poetry" key="poetry"
poetry add sponsorkit
```

```toml tab="pyproject.toml" key="pyproject"
[project]
dependencies = [
  "sponsorkit>=0.1,<0.2",
]
```
:::

Sponsorkit is a library, so you never install it with `pipx`. Declare it as a dependency of your own tool; when
your users run `pipx install your-tool`, it comes along. To try a script without creating a project,
`uv run --with sponsorkit python my_cli.py` installs it into a throwaway environment.

## Go {#go}

The module path is `github.com/sponsorkit/sponsorkit.io/sdks/go` and the package name is `sponsorkit`. It needs
Go 1.23 or later (its `go.mod` says `go 1.23`) and uses only the standard library.

```bash title="Terminal"
go get github.com/sponsorkit/sponsorkit.io/sdks/go
```

```go title="main.go"
import sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
```

The alias is optional, since the package is already named `sponsorkit`, but it makes the import read clearly. Go
fetches the module from GitHub through the module proxy, so there is no separate registry. Releases are tags
named `sdks/go/vX.Y.Z`; see [versions & pinning](versions.md#go).

## Rust {#rust}

The `sponsorkit` crate needs Rust 1.85 or later (it uses the 2024 edition) and a Tokio runtime.

:::tabs{group="cargo"}
```bash tab="cargo add" key="cargo-add"
cargo add sponsorkit
cargo add tokio --features macros,rt-multi-thread
```

```toml tab="Cargo.toml" key="cargo-toml"
[dependencies]
sponsorkit = "0.1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```
:::

- **Features.** The crate has no Cargo features of its own, so there is nothing to turn on or off.
- **TLS.** HTTPS goes through `reqwest` with `rustls`, so the crate doesn't link OpenSSL and needs no system
  libraries.
- **Tokio.** The SDK uses Tokio for timers, the loopback listener and cancellation, and works on the
  current-thread and multi-thread runtimes. `#[tokio::main]` needs the `macros` feature, plus `rt-multi-thread`
  for the default multi-thread flavour.
