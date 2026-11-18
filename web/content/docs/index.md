---
title: Sponsorkit documentation
description: Check whether the current user sponsors you on GitHub Sponsors or Open Collective, and help them start. No account, no API key, no stored data.
sidebar_label: Introduction
order: 0
---

<!-- OWNERS: platform. -->

Sponsorkit tells your software whether the current user supports you on GitHub Sponsors or Open Collective,
and helps them start. You write the rule; Sponsorkit reports the facts.

:::warning[Project status: pre-release]
- **The SDKs aren't published yet.** `@sponsorkit/sdk`, `Sponsorkit` and `sponsorkit` are not on npm, NuGet,
  PyPI or crates.io, and some of those names aren't reserved yet, so don't install them from a registry.
  [Install from source](install/from-source.md) until the first release is announced. (The Go module is
  fetched straight from GitHub.)
- **The hosted service isn't deployed yet.** Real sign-ins, checks and checkout links that point at the hosted
  API (`api.sponsorkit.io`) don't work today. Use [mock mode](guides/mock-mode.md), which needs no network, or
  [host the service yourself](reference-http/self-hosting.md) with your own OAuth apps.
:::

## Start here

- [Getting started](getting-started/index.md): the four steps of an integration.
- [Quickstart](getting-started/quickstart.md): copy-paste examples for every SDK.
- [Install](install/index.md): packages and supported runtimes.
- [Concepts](concepts/index.md): targets, sessions, the contribution shape and the error contract.
- [Guides](guides/index.md): checkout, nags, mock mode and backend verification.

## SDKs

| Language | Package | Guide | API reference |
|---|---|---|---|
| JavaScript / TypeScript | `@sponsorkit/sdk` | [Guide](languages/js/index.md) | [Reference](/docs/reference/js) |
| .NET | `Sponsorkit` | [Guide](languages/dotnet/index.md) | [Reference](/docs/reference/dotnet) |
| Python | `sponsorkit` | [Guide](languages/python/index.md) | [Reference](/docs/reference/python) |
| Go | `github.com/sponsorkit/sponsorkit.io/sdks/go` | [Guide](languages/go/index.md) | [Reference](/docs/reference/go) |
| Rust | `sponsorkit` | [Guide](languages/rust/index.md) | [Reference](/docs/reference/rust) |

Every SDK has the same behaviour, the same result shape and the same
[error contract](concepts/error-contract.md); only the naming follows each language's conventions.

## Under the hood

The SDKs talk to a small, stateless HTTP API. Its [wire protocol](reference-http/index.md) is public, and you can
[host it yourself](reference-http/self-hosting.md).
