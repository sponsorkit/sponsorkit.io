---
title: Sponsorkit for Go
description: Install and use the Go SDK (github.com/sponsorkit/sponsorkit.io/sdks/go) in CLIs, desktop tools and servers.
sidebar_label: Overview
---

Package `sponsorkit` tells your Go program what the current user has contributed to your GitHub Sponsors and
Open Collective accounts, signs them in, and sends them to contribute. It is written for command-line tools and
other programs one person runs, and has a helper for servers that need to check a supporter. It uses only the
standard library.

## Requirements

| | |
|---|---|
| Go | 1.23 or later (the module's `go.mod` says `go 1.23`) |
| Dependencies | None outside the standard library, and no cgo |
| Operating systems | Linux, macOS, Windows and the BSDs for sign-in and checkout (they open the system browser). `VerifySession` and mock mode run anywhere Go does. |
| Module path | `github.com/sponsorkit/sponsorkit.io/sdks/go` |
| Package name | `sponsorkit` |

## Install

Go modules are fetched straight from the Git repository through the module proxy, so there is no separate
registry and no package manager besides the `go` command. Pick the way that suits your project:

::::tabs{group="go-install"}
:::tab[go get]{key="go-get"}
From your module's directory:

```bash title="Terminal"
go get github.com/sponsorkit/sponsorkit.io/sdks/go@latest
```

`go get` adds a `require` line to `go.mod` and the checksums to `go.sum`. Ask for an exact version with
`@v0.1.0`, or for a branch or commit with `@main` or `@<commit>` (Go records a pseudo-version).
:::
:::tab[go.mod]{key="go-mod"}
Add the requirement by hand, then let Go fill in `go.sum`:

```text title="go.mod"
require github.com/sponsorkit/sponsorkit.io/sdks/go v0.1.0
```

```bash title="Terminal"
go mod tidy
```
:::
:::tab[Vendoring]{key="vendor"}
To build without network access, vendor your dependencies after adding the requirement:

```bash title="Terminal"
go get github.com/sponsorkit/sponsorkit.io/sdks/go@latest
go mod vendor
```

`go build` uses the `vendor/` folder automatically when it exists.
:::
:::tab[Local checkout]{key="local"}
To work against a clone of the repository, use a workspace (nothing to undo in `go.mod`):

```bash title="Terminal"
git clone https://github.com/sponsorkit/sponsorkit.io.git ../sponsorkit.io
go work init . ../sponsorkit.io/sdks/go
```

Or add a `replace` directive to `go.mod`:

```text title="go.mod"
require github.com/sponsorkit/sponsorkit.io/sdks/go v0.0.0

replace github.com/sponsorkit/sponsorkit.io/sdks/go => ../sponsorkit.io/sdks/go
```
:::
::::

Then import it. The package is already named `sponsorkit`; the alias only makes the import read clearly:

```go title="main.go"
import sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
```

:::note[Releases and pre-releases]
Releases are tags named `sdks/go/vX.Y.Z`, because the module lives in a subdirectory of the repository. Until
the first such tag exists, `@latest` resolves to a pseudo-version of the newest commit and `v0.1.0` can't be
fetched yet, so use `@main` or a commit; see [build from source](../../install/from-source.md#go) and
[versions & pinning](../../install/versions.md#go).
:::

## A first look

```go title="main.go"
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	ctx := context.Background()
	sk, err := sponsorkit.New(sponsorkit.Options{
		GitHub:  "octocat", // the account you receive sponsorships on
		AppName: "my-cli",  // shown on the consent page
	})
	if err != nil {
		log.Fatal(err) // invalid_config: a malformed target or option
	}

	// Never fails because of the network: it falls back to the cached result.
	fc, err := sk.GetFinancialContribution(ctx)
	if err != nil {
		log.Fatal(err) // only invalid_config, from the opt-in dev-time target check
	}
	if fc.SignedIn && len(fc.Active()) > 0 {
		fmt.Println("Thank you for sponsoring my-cli!")
		return
	}
	link, err := sk.CheckoutURL(sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Fprintln(os.Stderr, "Enjoying my-cli? Support it:", link)
}
```

Every method that can do network I/O or block takes a `context.Context`, every error from `New`, the `Client`
methods and `VerifySession` is a `*sponsorkit.Error` with a `Code`, and a `*Client` is safe for concurrent use.

## In this section

| Page | What it covers |
|---|---|
| [Quickstart](quickstart.md) | A complete CLI with a status check, a `sponsor` command and a nag. |
| [Configuration](configuration.md) | Every `Options` field with its default, per-call options and environment variables. |
| [Sign-in](sign-in.md) | Loopback and paste-back sign-in, choosing a flow, second identities, cancelling. |
| [Contributions](contributions.md) | `GetFinancialContribution`, the `Result`, its filter helpers, and caching. |
| [Checkout](checkout.md) | `OpenCheckout` and `CheckoutURL`. |
| [Nag](nag.md) | Asking for support every N runs or N days. |
| [Testing](testing.md) | Mock mode, test hooks, and a fake API with `net/http/httptest`. |
| [Backend verification](backend-verification.md) | Checking a supporter on your server with `VerifySession`. |
| [Errors and cancellation](errors.md) | `*sponsorkit.Error`, its codes, `errors.As`, and `context.Context`. |
| [Platform notes](platform-notes.md) | Contexts and goroutines, where state is stored, browsers, stdin, proxies. |

The [API reference](/docs/reference/go) lists every type, function, method, field and constant, generated from the
package's doc comments. The same documentation is on [pkg.go.dev](https://pkg.go.dev/github.com/sponsorkit/sponsorkit.io/sdks/go)
and in your terminal with `go doc github.com/sponsorkit/sponsorkit.io/sdks/go`.
