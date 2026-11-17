---
title: Concepts
description: The ideas behind every Sponsorkit SDK, from targets and sessions to caching, privacy and the security model.
sidebar_label: Overview
---

Every SDK implements the same behaviour, so these pages apply whichever language you use. Code samples come in
tabs for JavaScript/TypeScript, .NET, Python, Go and Rust.

## The data

- [Targets](targets.md): the accounts you receive sponsorships on, and why they're sealed into each session.
- [Contribution shape](contributions.md): the result every SDK returns, field by field, and its helpers.
- [Statuses](statuses.md): how provider states map to the eight Sponsorkit statuses.
- [Organization sponsorships](organizations.md): contributions made through a company or collective.

## How it behaves

- [Sign-in & sessions](sessions.md): popup, redirect, loopback and paste-back sign-in, a second identity, and the
  session token.
- [Caching & freshness](caching.md): the SDK is the cache; `stale`, `fromCache` and rate limits.
- [Error contract](error-contract.md): Sponsorkit must never break your app, and the error codes it can raise.

## Trust

- [Privacy & consent](privacy.md): what supporters see and agree to, and what is stored (nothing).
- [Security model](security.md): sealed tokens, PKCE, and what you can and can't trust on the client.

## In one paragraph

You configure **targets**. A supporter signs in once through a consent screen, and the SDK receives a sealed
**session token** bound to those targets. `getFinancialContribution()` returns the supporter's **contributions**
to your targets, answered from a local **cache** most of the time and live from the provider otherwise, and never
throws because of the network. Sponsorkit stores nothing; the token and cache live on the supporter's device. You
decide what the contributions mean.
