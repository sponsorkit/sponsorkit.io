---
title: Security model
description: How sealed tokens, PKCE and delivery rules protect supporters, what a session token can and can't do, and which checks you can trust on the client.
order: 90
---

Sponsorkit has no accounts and no API keys, so its security rests on three things: values only Sponsorkit can
read, sign-in codes only the requesting SDK can redeem, and a clear line between what the client can be trusted
with and what it can't.

## Sealed values

Everything Sponsorkit would normally keep in a database is instead **sealed**: encrypted and authenticated with
AES-256-GCM under keys only the service holds.

| Value | Contains | Lifetime |
|---|---|---|
| OAuth state | The pending sign-in's parameters | 10 minutes, bound to the browser that started it by a `__Host-` cookie |
| Sign-in code (`skc_…`) | The supporter's identity and provider permission, your targets, the PKCE challenge | 60 seconds, or 10 minutes for paste-back |
| Session token (`sks_…`) | The supporter's identities and provider permissions, your targets | 180 days, renewed on use |

- **Tampering fails closed.** Any change to a sealed value makes it undecryptable, and the request is rejected.
- **Each kind is bound to its purpose.** A sign-in code can't be presented as a session token, or the other way
  round.
- **Keys rotate without signing anyone out.** Two keys are active at a time; old tokens are re-sealed under the
  new key when they are renewed.

## Sign-in codes and PKCE

The SDK starts every sign-in with a fresh random secret (the PKCE verifier) and sends only its hash. Redeeming a
code requires the secret, so a code that leaks (in a browser history, a log or over someone's shoulder) is
useless to anyone else. How a code is delivered is constrained too:

- **Popup:** posted only to the opening window, and only to the origin the SDK declared. The browser enforces
  that origin, and the consent screen shows it.
- **Redirect:** only to an `https://` URL, or `http://` on `localhost` or `127.0.0.1`; the consent screen shows the host.
- **Loopback:** only to `http://127.0.0.1:<port>/callback` or `http://[::1]:<port>/callback`.
- **Paste-back:** shown to the person, who pastes it into the app that is waiting for it.

Provider sign-in only starts from the consent screen: when the browser reports (through Fetch Metadata) that the
request came from another site or was typed in, the service refuses it and links to the consent screen instead.
A crafted link can't skip what the supporter is agreeing to.

## What a session token can do

A session token lets its holder ask Sponsorkit for **this supporter's contributions to these targets**, until it
expires. That's all:

- It can't be used for other targets: they're sealed in, and the API has no way to ask about anything else.
- It can't be used to act on the supporter's GitHub or Open Collective account, because the provider permission
  inside it is never revealed.
- Its holder learns the same thing your app does: amounts, frequencies, statuses, handles.

Still, it is a credential for someone's sponsorship data. Store it where the SDK does, send it only over HTTPS to
your own backend, and never log it. Signing out deletes it locally, but there is no server-side session to
revoke. To cut off a leaked token, the supporter revokes Sponsorkit's access at the provider; its identity then
returns no new data and is flagged `needsReconnect`.

## What you can trust on the client

**Nothing that runs on the user's machine is tamper-proof.** The user controls the process, the disk and the
environment. They can edit the cached result, set `SPONSORKIT_MOCK=active-monthly`, or patch your binary.
Sponsorkit doesn't try to prevent that, and neither should you, for anything cosmetic:

| Use | Where to check |
|---|---|
| Thank-you messages, badges, hiding a nag or an ad | Client. Someone who fakes it only removes a reminder. |
| Unlocking something you host: an API, downloads, a premium service | Your **backend**, with `verifySession` |

For a decision that must hold, forward the session token to your backend and verify it there. The backend asks
Sponsorkit directly, so it gets a live answer that can't be forged, and it checks that the token was issued for
**your** targets (`targets_mismatch` otherwise). No key is needed. See
[backend verification](../guides/backend-verification.md).

## App identity

Web apps are identified by their origin, which the browser enforces. Native apps can't prove who they are: any
program can pass any `appName`. The consent screen says so, with the "says it is" label, and names the targets
that will be checked, which is what actually limits what an app can learn. This is a property of native OAuth in
general, not specific to Sponsorkit.

## Provider permissions

- **GitHub** tokens don't expire, but GitHub keeps at most 10 per user for one OAuth app. A supporter signed in to
  more than 10 apps that use Sponsorkit loses the oldest sign-in, which then needs reconnecting.
- **Open Collective** tokens last 90 days and can't be refreshed; the identity is then flagged `needsReconnect`.

Neither breaks your app: the provider is reported as unavailable and its last known contributions are served from
the cache with `stale: true`. See [reconnecting an identity](sessions.md#reconnecting-an-identity).
