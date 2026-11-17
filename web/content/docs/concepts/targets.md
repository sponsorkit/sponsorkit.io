---
title: Targets
description: The accounts you receive sponsorships on, how they are written and validated, and why they are sealed into each session.
order: 10
---

A **target** is an account you receive sponsorships on: `github:<login>` or `opencollective:<slug>`. An SDK
instance has a **target set** of one or more targets, at most one per provider. This is the only configuration
Sponsorkit needs; there is no account or API key.

:::tabs
```ts
const sk = new Sponsorkit({ github: "octocat", opencollective: "my-collective" });
```

```csharp
var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", OpenCollective = "my-collective" });
```

```python
sk = Sponsorkit(github="octocat", opencollective="my-collective")
```

```go
sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", OpenCollective: "my-collective"})
```

```rust
let sk = Sponsorkit::new(Options {
    github: Some("octocat".into()),
    opencollective: Some("my-collective".into()),
    ..Default::default()
})?;
```
:::

## Which accounts work

| Provider | You pass | It must be |
|---|---|---|
| GitHub Sponsors | The login of a user or organization | An account with a published GitHub Sponsors profile |
| Open Collective | The slug from `opencollective.com/<slug>` | An active, non-archived account that can receive contributions (a collective, for example) |

You can pass either one or both. With both, supporters can sign in with either provider (or both), and
[checkout](../guides/checkout.md) offers whichever fits the amount, currency and frequency you ask for.

## How targets are normalized

- **Trimmed and lowercased**, so `{ github: "Octocat" }` and `{ github: " octocat" }` are the same target.
- **Validated** against each provider's account-name rules: a GitHub login is 1 to 39 letters, digits or single
  hyphens, not starting or ending with a hyphen; an Open Collective slug is letters, digits and hyphens, starting
  with a letter or digit. A malformed target throws `invalid_config` from the constructor, before any I/O.
- **Sorted** into a canonical target set, such as `github:octocat,opencollective:my-collective`. Its SHA-256
  hash, the `targets_hash`, names the local storage file, so each target set has its own session and cache.

The SDK can't tell a misspelt account from one nobody sponsors yet. During development, turn on the existence
check with `SPONSORKIT_DEV_CHECKS=1`: the first call then throws `invalid_config` if a target doesn't exist or
has no sponsorship listing. See [verify the install](../install/verify.md#check-your-targets).

## Target sets are sealed into sessions

When a supporter signs in, the target set is sealed (encrypted and authenticated) into their session token,
together with their provider permission. Two consequences:

- **Your app can only ever learn about those accounts.** The consent screen names them, and the service refuses
  to answer for anything else, even if someone edits the token or the request. It can't be used to list the
  supporter's other sponsorships.
- **Changing the targets means signing in again.** Adding Open Collective to an app that only had GitHub creates a
  new target set, with a new storage file and no session yet. Pick your targets before you ship, and expect
  supporters to sign in once more when you change them.

Backends check the same binding: [`verifySession`](../guides/backend-verification.md) rejects a token that was
issued for a different target set with `targets_mismatch`. The [security model](security.md) explains why that
matters.
