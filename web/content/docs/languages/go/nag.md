---
title: Nag in Go
description: Ask for support every N runs or N days with Client.Nag, never in CI or in a pipe, and never someone who already contributes.
sidebar_label: Nag
order: 50
---

A nag is a gentle "Enjoying this? Consider supporting it" message. `Client.Nag` remembers how often and when it
was shown, so you only decide what to say and whom to ask.

```go title="main.go"
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	ctx := context.Background()
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", AppName: "my-cli"})
	if err != nil {
		log.Fatal(err)
	}

	// ... your program's real work ...

	nag := sk.Nag(sponsorkit.NagOptions{ID: "main", Every: 10, OrEvery: 7 * 24 * time.Hour})
	if nag.Due(ctx, func(fc *sponsorkit.Result) bool { return len(fc.Active()) == 0 }) {
		link, err := sk.CheckoutURL(sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly})
		if err != nil {
			log.Fatal(err)
		}
		fmt.Fprintln(os.Stderr, "Enjoying my-cli? Support it:", link)
		nag.Shown()
	}
}
```

Show the message after your program's real output, on stderr, so it never mixes with output that scripts parse.

## NagOptions

| Field | Meaning |
|---|---|
| `ID` | Names the nag. State is kept per ID and target set, so you can have several (say, one after `build` and one after `deploy`). An empty ID makes `Due` always false. |
| `Every` | The nag is due once it has been counted this many runs since it was last shown. |
| `OrEvery` | The nag is also due once this much time has passed since it was last shown. Zero disables this clause. |

To read `OrEvery` from a config file, `sponsorkit.ParseISODuration("P7D")` turns an ISO 8601 duration of weeks,
days, hours, minutes and seconds into a `time.Duration` (years and months aren't accepted, since their length
varies).

## When it's due

`Due(ctx, predicate, opts...)` does three things:

1. **Counts this run**, once per process per ID (the first `Due` call), even when it then returns false.
2. **Checks the predicate**, when it isn't nil, by calling `GetFinancialContribution`. That usually reads the
   cache; it never signs anyone in. A nil predicate counts as true.
3. **Returns** `predicate && (runs >= Every || time since last shown >= OrEvery)`. Before the first `Shown`, only
   the run count applies.

`Shown()` records that you showed the message: it resets the run counter and stores the time. If you decide not
to show it after all, don't call `Shown`, and the nag stays due.

So with `Every: 10` and `OrEvery` of seven days, a non-sponsor sees the message on their 10th run, then every 10th
run after that, or on the first run after a week since the last message, whichever comes first.

## When it's never due

`Due` returns false without asking the predicate when:

- `SPONSORKIT_DISABLE` is set, or
- `SPONSORKIT_NO_NAG` or `CI` is set, or
- stdout or stderr is not a terminal (the output is piped or redirected).

Runs are still counted in the last two cases. `sponsorkit.Force()` skips the `SPONSORKIT_NO_NAG`, `CI` and terminal
checks, for a nag you show in a GUI, for example; nothing overrides `SPONSORKIT_DISABLE`:

```go
due := nag.Due(ctx, nil, sponsorkit.Force())
```

`Options.Interactive` replaces the terminal check for the whole client, which is handy in tests.

## Where the state lives

Run counts and the last-shown time are stored in the same state file as the session (see
[platform notes](platform-notes.md#where-state-is-stored)), and `SignOut` keeps them. In mock mode they live in
memory, per `Client`. The [nag guide](../../guides/nag.md) has advice on wording and frequency that applies to
every language, and [Testing](testing.md#testing-a-nag) shows how to test one.
