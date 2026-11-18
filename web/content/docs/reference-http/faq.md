---
title: FAQ
description: Answers to common questions about cost, providers, privacy, tampering and what happens when Sponsorkit is offline.
order: 40
---

## Cost and setup

### What does Sponsorkit cost?

Nothing. There's no plan, no fee and no cut of contributions. Sponsorkit never touches money: supporters pay
GitHub Sponsors or Open Collective directly, under their usual terms. The SDKs are published under the MIT
license.

The hosted service is designed to fit Cloudflare's free Workers plan: the API Worker has no database, the
website and its consent and checkout pages are static files on GitHub Pages (so page views cost the Worker
nothing), and SDKs cache results locally so each user causes at most about one API call per hour. If you'd rather
not depend on it, you can [run your own](self-hosting.md).

### Do I need an account, an API key or a webhook?

No. You pass the GitHub login and/or Open Collective slug you receive contributions on, and that's the whole
configuration. Backends verify supporters with the supporter's own session token, so they don't need a key
either (see [backend verification](../guides/backend-verification.md)).

### Is there a dashboard?

No. Sponsorkit stores nothing, so there's nothing to show. Your sponsor lists and payouts stay on GitHub Sponsors
and Open Collective.

## Providers

### Which providers are supported?

**GitHub Sponsors** (users and organizations; monthly and one-time, always in USD) and **Open Collective**
(collectives; one-time, monthly and yearly, in the collective's currency). An app can use one or both. Each
contribution is reported in its provider's own currency; nothing is converted or added up.

### What about Patreon?

Patreon isn't supported as a target. Its OAuth consent would have to let an app read **all** of a person's
memberships, not just yours, which doesn't fit Sponsorkit's "only the accounts you name" promise. It may come later
through the same provider interface.

GitHub Sponsors lets people sponsor through their Patreon account. Those sponsorships do show up, as GitHub
contributions with the `via_patreon` flag.

### And Stripe, Ko-fi, Buy Me a Coffee, Liberapay?

Not supported. A Stripe Connect integration was part of an early design and was dropped, because Sponsorkit
doesn't process payments or hold accounts. Other platforms aren't supported today.

### Do organization sponsorships count?

Sponsorkit always reports them, marked `via: "organization"`, when the signed-in person belongs to a GitHub
organization (or administers an Open Collective account) that contributes to your targets. Whether they count is
your call; `direct()` filters them out. See [Organizations](../concepts/organizations.md).

### Are private sponsorships included?

Yes. The consent screen tells the person so: the app sees the amount, frequency and status of their contributions
to your accounts, including private ones. Contributions carry a `private` flag, so you can choose not to display
them. Private organization sponsorships may only be visible to the organization's admins.

## Privacy

### What does an app learn about a supporter?

Only their contributions to the accounts the app was configured with (amount, frequency, status, dates and tier),
a `supporter.id` that is specific to that set of accounts, and the provider user id and handle of each account
they signed in with (`supporter.identities`). Nothing else about their GitHub or Open Collective account is
shared, and their provider token never leaves Sponsorkit in readable form.

The consent screen shows exactly which accounts will be checked, with their avatars, and who is asking: the site's
origin for web apps, or the name a native app gives (labelled "says it is", because it can't be verified).

### What does Sponsorkit store?

Nothing. There's no database. Everything Sponsorkit needs is inside the encrypted session token that the SDK keeps
on the person's own device. Request logs record paths, never tokens, codes or identities. Signing out deletes the
token locally; to revoke access everywhere, the person revokes the Sponsorkit app in their GitHub or Open
Collective settings.

### Is `supporter.id` the same across apps?

No. `supporter.id` is pairwise: it's derived from the person's account **and** the app's set of targets, so two
apps with different targets get unrelated ids for the same person, and it isn't their GitHub or Open Collective
id. Keep in mind that the result also lists the provider user id and handle of each account the person signed in
with, so it's the id, not the whole result, that can't be linked across apps.

## Trust and tampering

### Can users fake being a sponsor?

Checks that run on the user's machine (in your CLI, desktop app or web page) can be patched out, like any
client-side check. That's an accepted trade-off: it's fine for hiding an ad or a nag. For anything that costs you
something, decide on your server with [backend verification](../guides/backend-verification.md). Session tokens
are encrypted and authenticated with a key only Sponsorkit has, so they can't be forged or edited, and
`verifySession` checks that a token was issued for your targets.

### Can another app steal my users' sign-in?

A sign-in code only works together with a secret (the PKCE verifier) that never leaves the app that started the
sign-in, and it's delivered only to that app: by `postMessage` to the page's origin, to a loopback address on the
person's own machine, or by the person pasting it. See [Wire protocol](protocol.md#delivery-methods).

## Reliability

### What happens if Sponsorkit, GitHub or Open Collective is down?

Your app keeps working. `getFinancialContribution()` never throws for network or server problems: it returns the
last result from its local cache, marked `stale`, or a signed-in result with no contributions if there's no
cache yet. Only sign-in, checkout and backend verification report the outage, as `network_error`. See
[Handle errors and offline](../guides/errors-and-offline.md).

### Does it work offline?

Yes, within the limits of a cache. Results are cached on the device for an hour by default, and served after that
too (marked `stale`) while the network is unavailable. Signing in and checking out need a connection.

### How quickly does a new sponsorship show up?

`openCheckout()` checks every minute after the supporter is sent to the provider, so usually within a minute or
two of paying. Otherwise, within `cacheTtl` (an hour by default) of the next call. GitHub reports a cancellation
only when the sponsorship actually ends, so a cancelled GitHub sponsorship stays `active` until then.

### Why was a supporter asked to sign in again?

Three common reasons: Open Collective sign-ins expire after 90 days (the identity is flagged `needsReconnect`);
GitHub keeps at most 10 tokens per person per OAuth app, so someone signed in to more than 10 Sponsorkit apps loses
the oldest sign-in; and a session that isn't used for 180 days expires.

### How do I turn Sponsorkit off?

Set `SPONSORKIT_DISABLE=1`. The SDK then makes no network calls, writes nothing, never nags, and reports a
signed-out result with `disabled: true`. `SPONSORKIT_NO_NAG=1` keeps everything except the nags. Both are worth
mentioning in your app's docs. See [Test your integration](../guides/mock-mode.md#environment-variables).
