---
title: Show a sponsor nag in a CLI
description: Print a polite "please support this project" message every N runs or every week, and never in CI or scripts.
order: 40
---

A short message every few runs is one of the most effective ways to find sponsors, and one of the easiest to get
wrong: nobody wants it in every run, in CI logs, or in output piped to another program. The nag helper handles
the counting and the "should I even print this?" checks, so your code only decides *who* sees it.

## Add the nag

This shows a message every 10 runs, or once a week, to anyone without an active contribution:

:::tabs
```ts title="cli.ts"
import { Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({ github: "octocat", appName: "my-cli" });

const nag = sk.nag({ id: "my-cli", every: 10, orEvery: "P7D" });
if (await nag.due((fc) => fc.active().length === 0)) {
  console.error(`❤️ Enjoying my-cli? Support it: ${sk.checkoutUrl({ frequency: "monthly" })}`);
  await nag.shown();
}
```
```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", AppName = "my-cli" });

var nag = sk.Nag(new NagOptions("my-cli") { Every = 10, OrEvery = TimeSpan.FromDays(7) });
if (await nag.DueAsync(fc => fc.Active().Count == 0))
{
    var url = sk.CheckoutUrl(new CheckoutUrlOptions { Frequency = Frequencies.Monthly });
    Console.Error.WriteLine($"❤️ Enjoying my-cli? Support it: {url}");
    nag.Shown();
}
```
```python title="cli.py"
import sys

from sponsorkit import Sponsorkit

sk = Sponsorkit(github="octocat", app_name="my-cli")

nag = sk.nag("my-cli", every=10, or_every="P7D")
if nag.due(lambda fc: not fc.active()):
    print(f"❤️ Enjoying my-cli? Support it: {sk.checkout_url(frequency='monthly')}", file=sys.stderr)
    nag.shown()
```
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

	nag := sk.Nag(sponsorkit.NagOptions{ID: "my-cli", Every: 10, OrEvery: 7 * 24 * time.Hour})
	if nag.Due(ctx, func(fc *sponsorkit.Result) bool { return len(fc.Active()) == 0 }) {
		url, _ := sk.CheckoutURL(sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly})
		fmt.Fprintln(os.Stderr, "❤️ Enjoying my-cli? Support it:", url)
		nag.Shown()
	}
}
```
```rust title="main.rs"
use std::time::Duration;

use sponsorkit::{CheckoutOptions, Frequency, NagOptions, Options, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        app_name: Some("my-cli".into()),
        ..Default::default()
    })?;

    let week = Duration::from_secs(7 * 24 * 60 * 60);
    let nag = sk.nag(NagOptions::new("my-cli", 10).or_every(week));
    if nag.due(|fc| fc.active().is_empty()).await {
        let url = sk.checkout_url(&CheckoutOptions {
            frequency: Some(Frequency::Monthly),
            ..Default::default()
        })?;
        eprintln!("❤️ Enjoying my-cli? Support it: {url}");
        nag.shown().await;
    }
    Ok(())
}
```
:::

Print the message to **stderr**, so it never ends up in output that's piped to another program or parsed.

## When it's due

`due()` returns:

```text
predicate(result) && (runs >= every || time since last shown >= orEvery)
```

- **Runs are counted once per process per `id`**, on the first `due()` call, even when your predicate is false.
  Calling `due()` again in the same process doesn't count again.
- **`shown()` resets** the run counter to zero and records the time. Call it only when you actually printed the
  message.
- **`orEvery` is optional.** It's an ISO-8601 duration (`"P7D"`) or the language's duration type
  (`TimeSpan`, `timedelta`, `time.Duration`, `std::time::Duration`; seconds in JavaScript). Before the first
  `shown()`, this clause is false, so a brand-new install is nagged by run count only.
- **The predicate is yours.** It receives the same result as [`getFinancialContribution()`](gate-features.md),
  which is cached, so it doesn't cost a network call per run. For someone who never signed in, there's no network
  call at all and `active()` is empty.

The counter and the last-shown time are stored with the session, per set of targets and per `id`, and survive
sign-out.

## When it's never due

`due()` always returns false, without calling your predicate, when:

- `SPONSORKIT_DISABLE` is set (Sponsorkit is off entirely);
- `SPONSORKIT_NO_NAG` is set (a person opted out of nags);
- `CI` is set (CI systems set it, and nobody reads nags in build logs);
- stdout or stderr isn't a terminal (the output is piped or redirected).

A variable counts as set when it's non-empty and not `0` or `false`. Mention `SPONSORKIT_NO_NAG=1` in your docs
so people who've already decided can switch it off.

To override the terminal check, set the `interactive` option (`Interactive` in .NET and Go). To skip the
terminal, `CI` and `SPONSORKIT_NO_NAG` checks for one call, pass `force` (`{ force: true }` in JavaScript,
`force: true` in .NET, `force=True` in Python, `sponsorkit.Force()` in Go, `due_with(…, DueOptions { force: true })`
in Rust). Nothing overrides `SPONSORKIT_DISABLE`.

In the browser SDK, `nag()` works the same way, except that the page always counts as interactive.

## It never signs anyone in

The nag never opens a browser or prompts for anything. It only reads what's already stored. Give people a
separate command to sign in (see [Use Sponsorkit in a CLI or desktop app](native-apps.md)) and one to sponsor
(see [Open checkout and detect a new contribution](checkout.md)).

The link from `checkoutUrl()` is built offline, needs no sign-in and opens the same checkout page. Contributions
made through it aren't detected straight away, but they show up the next time the supporter signs in or the
cache refreshes.

## Testing your nag

Nags are hard to see in tests, because test runners usually aren't terminals and CI sets `CI`. Use
[mock mode](mock-mode.md) together with `interactive: true` and an `env` option that doesn't include `CI`, or
call `due()` with `force`. In mock mode, nag state lives in memory per client instance, so each test starts
fresh.
