---
title: Sign-in & sessions
description: How supporters sign in from browsers, CLIs and headless machines, how a second identity is added, and what the session token is.
order: 20
---

A supporter signs in once, with GitHub or Open Collective, through a Sponsorkit consent screen. The screen
names your targets and who is asking: the site's origin for web apps, or the `appName` your native app passes,
labelled "says it is" because a native app can't prove its name. After that, the SDK holds a session token and
checks are silent.

Sponsorkit never signs anyone in on its own, not even from the [nag helper](../guides/nag.md). Call `signIn()`
from something the user chose to do: a button, a menu item, a `login` command.

## Sign-in methods

The consent screen is always a web page; what differs is how the one-time sign-in code gets back to your app.

| Where your code runs | Method | What happens |
|---|---|---|
| Browser | Popup | `signIn()`, called from a click handler, opens a popup. The code is posted back to your page's origin only. |
| Browser, popup blocked | Redirect | With `returnTo` set, the page navigates to Sponsorkit and comes back with `?sponsorkit_code=…`. |
| CLI or desktop | Loopback | The SDK listens on `127.0.0.1` on a random port and opens the system browser; the code comes back to that port. |
| SSH, containers, no display | Paste-back | The SDK prints a link. The user opens it on any device and pastes the code shown back into the terminal. |

### Popup and redirect (browsers)

`signIn()` must run synchronously inside a click handler, because browsers only allow popups from a user
gesture. If the popup is blocked anyway, `signIn()` rejects with `popup_blocked`, unless you passed `returnTo`
(an `https://` URL of your app, or `http://` on `localhost` or `127.0.0.1`): then the whole page navigates to Sponsorkit and returns to
`returnTo` with `?sponsorkit_code=…`. The SDK finishes that sign-in on its next call and removes the parameter
from the address bar; call `handleRedirectCallback()` yourself if you want to observe errors.

```ts title="app.ts"
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", returnTo: location.href });
signInButton.onclick = () => sk.signIn();
```

### Loopback (CLIs and desktop apps)

The SDK binds `127.0.0.1` on a random free port, opens the system browser on the consent screen, and waits for the
browser to be redirected to `http://127.0.0.1:<port>/callback?code=…`. The browser shows "You can close this
window", and the SDK exchanges the code. This is the flow that RFC 8252 recommends for native apps; no other
redirect target is accepted for it.

### Paste-back (SSH and headless)

The SDK prints a link to standard error and asks for a code. The user opens the link on any device (a laptop
while SSH'd into a server, a phone), approves, and copies the code from the page. The code is valid for **10
minutes** and is useless without a secret that only the waiting SDK holds.

:::note[Apps that read standard input]
The default prompt reads a line from stdin, and a blocking read can't be cancelled. After a cancelled or timed-out
paste-back, the next line the user types may still go to that pending read. If your app reads stdin itself,
supply your own prompt with the `promptForCode` option (`PromptForCode`, `prompt_for_code`).
:::

### How native SDKs choose

With the default `auto` method, native SDKs use paste-back when they detect an SSH session or no graphical
display. An SSH session means `SSH_CONNECTION` is set (the JavaScript, Python and Rust SDKs also accept
`SSH_TTY`). No display means neither `DISPLAY` nor `WAYLAND_DISPLAY` is set; the .NET, Python, Go and Rust SDKs
apply this check on every system except Windows and macOS, while the JavaScript SDK applies it on Linux only
(on other Unix systems it tries the browser first). Otherwise they try loopback, and fall back to paste-back if the listener can't bind to `127.0.0.1` or the browser can't be
opened. Force a method per client with the `signInMethod` option, or per call:

:::tabs
```ts
await sk.signIn({ method: "paste" }); // "auto" | "loopback" | "paste" (@sponsorkit/sdk/node)
```

```csharp
await sk.SignInAsync(new SignInOptions { Method = SignInMethod.Paste });
```

```python
sk.sign_in(method="paste")
```

```go
_, err := sk.SignIn(ctx, sponsorkit.SignInOptions{Method: sponsorkit.SignInPaste})
```

```rust
sk.sign_in(SignInOptions { method: Some(SignInMethod::Paste), ..Default::default() }).await?;
```
:::

## A second identity

A supporter may sponsor you on GitHub and contribute on Open Collective. While signed in, signing in with the
other provider adds that identity to the **same** session; the new session token holds both, and the next
result includes contributions from both providers.

:::tabs
```ts
await sk.signIn({ provider: "opencollective" });
```

```csharp
await sk.SignInAsync(new SignInOptions { Provider = Providers.OpenCollective });
```

```python
sk.sign_in("opencollective")
```

```go
if _, err := sk.SignIn(ctx, sponsorkit.SignInOptions{Provider: sponsorkit.OpenCollective}); err != nil {
	return err
}
```

```rust
sk.sign_in(SignInOptions { provider: Some(Provider::OpenCollective), ..Default::default() }).await?;
```
:::

- `provider` also skips the provider picker on a first sign-in.
- Signing in again with a provider that's already in the session replaces that identity.
- `supporter.id` stays the same: it is derived from the first identity of the session.
- If the stored session turns out to be expired while adding an identity, the SDK starts a fresh session with the
  new identity instead of failing.

## Reconnecting an identity

Provider permissions don't always last as long as the session:

- **Open Collective** sign-ins expire after 90 days and can't be refreshed.
- **GitHub** keeps at most 10 tokens per user for one OAuth app, so a supporter signed in to more than 10 apps
  that use Sponsorkit loses the oldest sign-in. A supporter can also revoke access in their GitHub settings.

Neither signs the supporter out. The identity is marked `needsReconnect: true`, its provider is reported as
unavailable, and that provider's contributions are served from the local cache with `stale: true`. Signing in
with that provider again re-seals the session with a fresh permission:

:::tabs
```ts
const stale = fc.supporter?.identities.find((i) => i.needsReconnect);
if (stale) await sk.signIn({ provider: stale.provider });
```

```csharp
var stale = fc.Supporter?.Identities.FirstOrDefault(i => i.NeedsReconnect);
if (stale is not null) await sk.SignInAsync(new SignInOptions { Provider = stale.Provider });
```

```python
stale = next((i for i in fc.supporter.identities if i.needs_reconnect), None) if fc.supporter else None
if stale is not None:
    sk.sign_in(stale.provider)
```

```go
if fc.Supporter != nil {
	for _, id := range fc.Supporter.Identities {
		if id.NeedsReconnect {
			_, _ = sk.SignIn(ctx, sponsorkit.SignInOptions{Provider: id.Provider})
		}
	}
}
```

```rust
let stale = fc.supporter.as_ref().and_then(|s| s.identities.iter().find(|i| i.needs_reconnect));
if let Some(identity) = stale {
    sk.sign_in(SignInOptions { provider: Some(identity.provider), ..Default::default() }).await?;
}
```
:::

## Timeouts and cancellation

A sign-in waits for a human, so it is bounded. After `signInTimeout` (default 5 minutes) it fails with `timeout`.
You can also cancel it, and it then fails with `cancelled`, as it does when the user closes the popup or enters
an empty code.

:::tabs
```ts
await sk.signIn({ signal: AbortSignal.timeout(60_000) }); // "cancelled" after 60 s
```

```csharp
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(60));
await sk.SignInAsync(cancellationToken: cts.Token); // "cancelled" after 60 s
```

```python
sk.sign_in(timeout=60)  # "timeout" after 60 s; or pass cancel=threading.Event() and set it
```

```go
ctx60, cancel := context.WithTimeout(ctx, 60*time.Second)
defer cancel()
_, err := sk.SignIn(ctx60) // "cancelled" after 60 s
```

```rust
let cancel = CancellationToken::new(); // cancel.cancel() fails the sign-in with "cancelled"
sk.sign_in(SignInOptions { cancel: Some(cancel.clone()), ..Default::default() }).await?;
```
:::

The full list of sign-in errors is in the [error contract](error-contract.md#error-codes).

## Session tokens {#tokens}

Every flow uses PKCE: the SDK creates a random secret (the verifier), sends only its hash with the sign-in, and
proves it holds the secret when it exchanges the code. A sign-in code that leaks (in a browser history, a
screenshot or a terminal log) is useless on its own. Codes also expire quickly: after 60 seconds, or 10 minutes
for paste-back.

The exchange returns a **session token**, `sks_…`: an encrypted blob that only Sponsorkit can read. It contains
the supporter's identities, their provider permissions and your target set. The SDK stores it locally (see
[where state is stored](../install/supported-platforms.md#where-state-is-stored)) and sends it with each check.

- **Lifetime.** 180 days from when it was issued. A check made when the token is more than 7 days old returns a
  renewed token, which the SDK stores automatically, so a supporter who keeps using your app stays signed in.
- **Invalid tokens.** If the service rejects the token (expired or tampered with), the SDK deletes it and the
  cache, and returns the signed-out result. It doesn't throw.
- **One session per target set.** Each target set has its own token, so changing your targets means a new
  sign-in; see [targets](targets.md#target-sets-are-sealed-into-sessions).

To check sponsorships on your server, forward the token from your app; see
[backend verification](../guides/backend-verification.md). The [security model](security.md) explains what a
token can and can't be used for.

## Signing out

`signOut()` deletes the session token and the cached result on the device; nag counters are kept. Sponsorkit has
no server-side session to end, because it stores nothing. To withdraw access completely, the supporter revokes
the Sponsorkit app in their GitHub or Open Collective settings, which invalidates that identity in every app at
once.
