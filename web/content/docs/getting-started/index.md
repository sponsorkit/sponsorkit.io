---
title: Getting started
description: What Sponsorkit is, who it's for, how a check works from end to end, and the four steps of an integration.
sidebar_label: Overview
---

Sponsorkit lets your software ask one question: **does the person using it support you on GitHub Sponsors or
Open Collective, and how?** It also sends people to contribute when they want to. What you do with the answer
is up to you: say thank you, show a gentle reminder every few runs, hide an ad, or unlock a feature.

There is no Sponsorkit account to create, no API key, no webhook and no dashboard. You name the accounts you
receive money on, and the SDK does the rest.

:::warning[Project status: not live yet]
The hosted API at `api.sponsorkit.io` isn't deployed yet, so real sign-ins, checks and `checkoutUrl()` links
that point at it don't work today. Some provider behaviour (for example which GitHub sponsorship data the
requested scopes return) has only been tested against stubbed provider responses, not live GitHub or Open
Collective accounts. What works now: [mock mode](../guides/mock-mode.md), which needs no network, and
[self-hosting](../reference-http/self-hosting.md) the service with your own OAuth apps. The SDKs aren't on the
package registries yet either; see [Install](../install/index.md).
:::

## Who it's for

Sponsorkit is for open source maintainers who ship something people run:

- **CLIs and desktop apps** (Node, Bun, Deno, .NET, Python, Go, Rust). Sign-in uses the system browser, or a
  paste-back code over SSH and in containers.
- **Web apps** (any browser). Sign-in uses a popup, with a redirect fallback when popups are blocked.
- **Backends** that need a trustworthy answer, for example before unlocking a paid feature. They verify a
  session token forwarded by the app; see [backend verification](../guides/backend-verification.md).

It reports facts and never decides for you. It doesn't sum amounts across providers, convert currencies or
decide who "counts" as a supporter. You write that rule, in your own code.

## How it works

Your app talks to a small, stateless service: an HTTP API at `https://api.sponsorkit.io`, plus the consent and
checkout pages of this website (`https://sponsorkit.github.io/sponsorkit.io`). The service has no database:
everything it needs travels inside an encrypted session token that the SDK keeps on the supporter's device.

```text title="One sign-in, then cheap checks"
  Your app + SDK                    Sponsorkit (no database)               GitHub / Open Collective
  ─────────────────                 ───────────────────────────            ────────────────────────
  1  signIn()  ── opens ─────────▶  consent screen: names your
                                    targets and who is asking  ── OAuth ─▶ supporter approves
                                                               ◀────────
     ◀── one-time sign-in code (popup, loopback or paste-back) ──
  2  code + PKCE verifier ───────▶  POST /api/v1/auth/token
     ◀── sealed session token (sks_…) + first result
         stored locally on the supporter's device

  3  getFinancialContribution()
       cache fresh? ── yes ──▶ answered locally, no network
            │ no
            └─ GET /api/v1/contributions ─▶ unseal token ── live query ──▶ provider
               ◀── normalized contributions (nothing is stored) ◀─────────

  4  your rule: thank, nag, hide an ad, unlock a feature
```

1. **Sign-in, once.** The supporter approves a consent screen that names exactly which of your accounts will be
   checked. The SDK receives a short-lived code that is useless without a secret only it holds (PKCE).
2. **A sealed session.** The code is exchanged for a session token. Only Sponsorkit can decrypt it, and it is
   bound to your accounts, so it can't be used to look at anything else.
3. **Checks.** `getFinancialContribution()` answers from the local cache for an hour by default. On a cache miss
   the service unseals the token and asks the provider live, with the supporter's own permission. It stores
   nothing.
4. **Your rule.** You get the raw contributions and decide what to do.

When the user hasn't signed in, a check returns a signed-out result immediately, without any network call. When
Sponsorkit or a provider is down, the check serves the cache instead of throwing. Your app never breaks because
of Sponsorkit: see the [error contract](../concepts/error-contract.md).

## The four steps

1. **Install the SDK** for your language, from the repository until the first release. See [Install](../install/index.md).
2. **Name your targets:** the GitHub login and/or Open Collective slug you receive sponsorships on. See
   [Targets](../concepts/targets.md).
3. **Check, and offer to sign in.** Call `getFinancialContribution()`. If the user isn't signed in, call
   `signIn()` when it makes sense, for example from a "Link your sponsorship" button or a `login` command.
   Sponsorkit never signs anyone in on its own.
4. **Decide** what to do with the result. A link from `checkoutUrl()` sends people to contribute;
   `openCheckout()` does the same and waits until the new contribution shows up.

:::tip[Try it without signing in]
Set `SPONSORKIT_MOCK=active-monthly` in the environment (or pass the `mock` option) and every SDK returns a
realistic result without touching the network or the disk. See [mock mode](../guides/mock-mode.md).
:::

Next: the [quickstart](quickstart.md) builds a small working CLI in your language in a few minutes.
