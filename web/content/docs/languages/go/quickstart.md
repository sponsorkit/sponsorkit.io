---
title: Go quickstart
description: A complete command-line tool that thanks sponsors, has a sponsor command and nags politely, first in mock mode and then for real.
sidebar_label: Quickstart
order: 5
---

This page builds a small CLI, `my-cli`, with three Sponsorkit features:

- `my-cli status` says whether you currently sponsor it.
- `my-cli sponsor` signs you in if needed, opens checkout in the browser and waits for the contribution.
- Every other run does its normal work and, every 10 runs or 7 days, asks non-sponsors for support.

You need Go 1.23 or later. There is no Sponsorkit account or API key to set up.

## 1. Create the module

```bash title="Terminal"
mkdir my-cli && cd my-cli
go mod init example.com/my-cli
go get github.com/sponsorkit/sponsorkit.io/sdks/go@main
```

## 2. Write the program

Replace `octocat` with the GitHub login (or the Open Collective slug, in `OpenCollective`) that receives your
sponsorships.

```go title="main.go"
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"time"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	// Ctrl+C cancels the context, which abandons a sign-in or checkout cleanly.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	sk, err := sponsorkit.New(sponsorkit.Options{
		GitHub:  "octocat",
		AppName: "my-cli", // shown on the consent page as "my-cli says it is…"
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err) // invalid_config: fix the options
		os.Exit(2)
	}

	cmd := ""
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	switch cmd {
	case "status":
		status(ctx, sk)
	case "sponsor":
		sponsor(ctx, sk)
	default:
		fmt.Println("Doing my-cli's real work…")
		nag(ctx, sk)
	}
}

// isSponsor is your rule. This one counts any active contribution.
func isSponsor(fc *sponsorkit.Result) bool {
	return len(fc.Active()) > 0
}

func status(ctx context.Context, sk *sponsorkit.Client) {
	fc, err := sk.GetFinancialContribution(ctx) // never fails because of the network
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return
	}
	switch {
	case !fc.SignedIn:
		fmt.Println("Not signed in. Run `my-cli sponsor` to support my-cli.")
	case isSponsor(fc):
		fmt.Println("Thank you for sponsoring my-cli!")
	default:
		fmt.Println("Signed in, no active sponsorship yet.")
	}
	if fc.Stale {
		fmt.Println("(Sponsorkit couldn't be reached; this is the last known state.)")
	}
}

func sponsor(ctx context.Context, sk *sponsorkit.Client) {
	// Signs in first when needed (loopback, or paste-back over SSH), then waits
	// up to 10 minutes for the new contribution to show up.
	r, err := sk.OpenCheckout(ctx, sponsorkit.CheckoutOptions{
		Frequency: sponsorkit.Monthly,
		Amount:    500, // $5.00 suggested; the supporter can change it
	})
	var skErr *sponsorkit.Error
	switch {
	case errors.As(err, &skErr) && skErr.Code == sponsorkit.CodeAccessDenied:
		fmt.Println("Access was denied at the provider. Nothing changed.")
	case err != nil:
		fmt.Fprintln(os.Stderr, "Couldn't start checkout:", err)
	case r.Status == sponsorkit.CheckoutContributed:
		fmt.Printf("Thank you! %d %s %s\n", r.Contribution.Amount.Value, r.Contribution.Amount.Currency, r.Contribution.Frequency)
	default:
		fmt.Println("No new contribution detected yet. If you did contribute, run `my-cli status` later.")
	}
}

func nag(ctx context.Context, sk *sponsorkit.Client) {
	n := sk.Nag(sponsorkit.NagOptions{ID: "main", Every: 10, OrEvery: 7 * 24 * time.Hour})
	if n.Due(ctx, func(fc *sponsorkit.Result) bool { return !isSponsor(fc) }) {
		fmt.Fprintln(os.Stderr, "Enjoying my-cli? Support it with `my-cli sponsor`.")
		n.Shown()
	}
}
```

## 3. Try it in mock mode

Mock mode needs no network and no real sponsorship. Pick a preset with `SPONSORKIT_MOCK`:

```bash title="Terminal"
SPONSORKIT_MOCK=active-monthly go run . status   # Thank you for sponsoring my-cli!
SPONSORKIT_MOCK=signed-out go run . status       # Not signed in. …
SPONSORKIT_MOCK=none go run . sponsor            # Thank you! 500 USD monthly
```

In mock mode, `OpenCheckout` resolves at once with a simulated contribution. The presets are listed in
[Testing](testing.md#presets).

## 4. Run it for real

```bash title="Terminal"
go run . sponsor
```

On a machine with a desktop, the SDK listens on `127.0.0.1` and opens the checkout page in your browser. You sign
in there, the page hands the SDK a one-time code through the local listener, and you go on to contribute while
the SDK polls until the new contribution shows up. Over SSH or without a display, it prints a URL to open on any
device and asks you to paste the code that page shows. After that, `go run . status` reads the result from the local cache (one
hour by default) and refreshes it from the API when it's older.

## What to read next

- [Sign-in](sign-in.md): how the flow is chosen, and how to add a second provider.
- [Contributions](contributions.md): the `Result` fields and writing your own rule (amounts, organizations,
  one-time payments).
- [Nag](nag.md): exactly when `Due` returns true, and why it never nags in CI.
- [Errors and cancellation](errors.md): every error code and what to do about it.
