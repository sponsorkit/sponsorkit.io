---
title: Privacy & consent
description: What a supporter sees and agrees to, what your app learns, what Sponsorkit stores (nothing), and what stays on the supporter's device.
order: 80
---

Asking people about their sponsorships is personal. Sponsorkit is built so that a supporter knows exactly what is
shared, your app learns only what it needs, and Sponsorkit itself keeps nothing.

## What the supporter sees

Before anything is shared, the supporter sees a consent screen on the Sponsorkit website
(`sponsorkit.github.io/sponsorkit.io`, or your own site if you [self-host](../reference-http/self-hosting.md)) with:

- **Your targets**, each with the avatar and name fetched from GitHub or Open Collective, so a lookalike account
  is easier to spot.
- **Who is asking.** For a web app, the site's origin, taken from the browser. For a redirect sign-in, the host it
  returns to. For a native app, "Requested by an app on this computer" (or "on another device" for paste-back),
  followed by the `appName` you pass, labelled **"says it is"** because Sponsorkit can't verify it. Without an
  `appName` the screen says "An app that didn't give its name", so always pass one.
- **What will be shared**, in plain words:

  > An app wants to know whether you sponsor **@octocat** on GitHub and **My Collective** on Open Collective.
  > It will see the amount, frequency and status of those contributions only, including private ones. Nothing
  > else about your account is shared, and Sponsorkit stores nothing.

- **One button per provider** in your target set. The provider then asks for its own permission.

| Provider | Permission requested | Why |
|---|---|---|
| GitHub | `read:user read:org` | Read the supporter's sponsorships, and those of organizations they belong to |
| Open Collective | `orders incognito` | Read the supporter's contributions, including incognito ones |

## What your app learns

Only what is in the [contribution result](contributions.md):

- contributions to **your targets**, and nothing about other accounts the supporter sponsors;
- the supporter's provider user ids and handles (`identities`);
- a **pairwise** `supporter.id`: stable for the same person and the same target set (it is derived from the
  identity they first signed in with), and different for apps with other targets, so unrelated apps can't match
  up their users.

The provider permission itself never reaches your app: it travels only inside the encrypted session token, which
only Sponsorkit can decrypt. Private and incognito contributions are included because the supporter agreed to
share them with you. Treat them as private and don't display them publicly.

## What Sponsorkit stores

Nothing. Sponsorkit is a stateless service with no database:

- Sessions, sign-in codes and OAuth state are sealed, encrypted values that travel with the request.
- Contributions are fetched live when an SDK asks, returned, and forgotten.
- Request logs never contain tokens, codes or identities.
- The only server-side cache holds **public** target data (names, avatars, tiers) for an hour.

## What stays on the supporter's device

The SDK keeps one small file (or `localStorage` entry in browsers) per target set, holding the session token, the
last result and nag counters; see [where state is stored](../install/supported-platforms.md#where-state-is-stored).
On Linux and macOS the file is readable only by the user (`0600`); on Windows it lives in the user's profile.
The SDK sends nothing but the session token, and only to Sponsorkit when a check needs fresh data.

## Leaving

- **Sign out:** give users a way to call `signOut()` (a button or a `logout` command). It deletes the token and
  the cached result on that device.
- **Revoke access** at GitHub (Settings, Applications) or Open Collective to withdraw the permission for every
  app that uses Sponsorkit at once.
- **Opt out entirely** with `SPONSORKIT_DISABLE=1`: the SDK then makes no network calls and writes nothing.

## Telling your users

A short note in your README or privacy policy goes a long way. For example:

> `my-cli` can check whether you sponsor its author on GitHub Sponsors or Open Collective. This only happens after
> you run `my-cli login` and approve it on Sponsorkit's consent page. It learns the amount, frequency and status of your
> sponsorships of this project only, stores a sign-in token in your config directory, and never shares it with
> anyone else. Run `my-cli logout` to forget it, or set `SPONSORKIT_DISABLE=1` to turn it off.
