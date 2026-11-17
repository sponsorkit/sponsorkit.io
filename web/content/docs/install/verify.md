---
title: Verify the install
description: Print the installed SDK version, run a smoke test that needs no sign-in and no network, then check that your targets exist.
order: 30
---

Three quick checks, from cheapest to most complete.

## Which version is installed?

:::tabs
```bash tab="JavaScript" key="js"
npm ls @sponsorkit/sdk
node -p "require('@sponsorkit/sdk/package.json').version"
```

```bash tab=".NET" key="dotnet"
dotnet list package
```

```bash tab="Python" key="python"
python -c "import sponsorkit; print(sponsorkit.__version__)"
```

```bash tab="Go" key="go"
go list -m github.com/sponsorkit/sponsorkit.io/sdks/go
```

```bash tab="Rust" key="rust"
cargo tree -p sponsorkit --depth 0
```
:::

A Go module fetched from a branch shows a pseudo-version such as `v0.0.0-20261116235755-2c9566dc8990`
(timestamp and commit) instead of a release tag.

## Smoke test without signing in

Mock mode runs the whole SDK without the network or the disk, so it proves the package loads and your code
compiles and runs. With the [quickstart](../getting-started/quickstart.md) program:

```bash title="Terminal"
SPONSORKIT_MOCK=none node my-cli.mjs
```

It prints a "Support it" link, because the `none` preset is a signed-in supporter without contributions. Use
the run command for your language from the quickstart (`dotnet run`, `python my_cli.py`, `go run .`,
`cargo run`); the environment variable works the same in every SDK.

## Check your targets

A typo in a login or slug is the most common integration mistake: the SDK can't tell a misspelt account from
one nobody sponsors yet. The development check asks Sponsorkit once per process whether each target exists and
has a sponsorship listing:

```bash title="Terminal"
SPONSORKIT_DEV_CHECKS=1 node my-cli.mjs
```

If a target doesn't exist, the first call (`getFinancialContribution()`, `signIn()` or `openCheckout()`)
fails with `invalid_config` and a message naming it, for example a GitHub account without a Sponsors profile. If
Sponsorkit can't be reached, the check is skipped rather than failing.

The check is off by default, except in JavaScript when `NODE_ENV` is `development` and in Python under
`python -X dev`. You can also force it per instance with the `devChecks` option (`DevChecks`, `dev_checks`).
Leave it off in production: it's an extra request at startup.
