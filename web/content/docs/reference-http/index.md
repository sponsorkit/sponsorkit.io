---
title: HTTP API & protocol
description: The HTTP API and wire protocol behind the SDKs, how to run your own instance, and answers to common questions.
sidebar_label: Overview
---

The five SDKs are clients of one small HTTP API, served by a single stateless Cloudflare Worker at
`https://sponsorkit.io`. Most apps never call it directly. Read this section if you want to:

- **call the API without an SDK**, for example to verify sessions from a backend in another language:
  [HTTP API](http-api.md);
- **understand or review the design**, or **write an SDK** for another language:
  [Wire protocol](protocol.md);
- **run your own instance** on your own domain: [Self-hosting](self-hosting.md);
- **find a quick answer** about cost, providers, privacy or reliability: [FAQ](faq.md).

## Source documents

The normative definitions live in the repository, next to the code:

- [`docs/PROTOCOL.md`](https://github.com/sponsorkit/sponsorkit.io/blob/main/docs/PROTOCOL.md): exactly what goes
  over the wire. The Worker, the static pages, the conformance suite and every SDK follow it.
- [`docs/SPEC.md`](https://github.com/sponsorkit/sponsorkit.io/blob/main/docs/SPEC.md): why Sponsorkit works the
  way it does, including the trade-offs and the decisions behind them.
- [`sdks/conformance`](https://github.com/sponsorkit/sponsorkit.io/tree/main/sdks/conformance): a fake API and the
  scenarios every SDK must pass. A new SDK is complete when it passes all of them.

## At a glance

| Endpoint | Auth | Purpose |
|---|---|---|
| [`GET /api/v1/targets`](http-api.md#get-targets) | none | Public metadata about your accounts: existence, name, avatar, currency, tiers. |
| [`POST /api/v1/auth/token`](http-api.md#post-auth-token) | sign-in code + PKCE verifier | Exchanges a sign-in code for a session token. |
| [`GET /api/v1/contributions`](http-api.md#get-contributions) | `Bearer sks_…` | The supporter's live contributions to the session's targets. |
| [`GET /api/v1/health`](http-api.md#get-health) | none | Whether each provider is reachable. |

Sign-in and checkout run in the browser through the `/connect` and `/checkout` pages; see
[Wire protocol](protocol.md#sign-in).
