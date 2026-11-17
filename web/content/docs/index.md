---
title: Sponsorkit documentation
description: Check whether the current user sponsors you on GitHub Sponsors or Open Collective, and help them start. No account, no API key, no stored data.
sidebar_label: Introduction
order: 0
---

<!-- OWNERS: platform. -->

Sponsorkit tells your software whether the current user supports you on GitHub Sponsors or Open Collective,
and helps them start. You write the rule; Sponsorkit reports the facts.

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
