---
title: Quickstart
description: Build a small CLI that checks for a sponsorship, signs supporters in and opens the checkout, in about three minutes.
order: 10
---

This page builds `my-cli`, a tiny command-line program with three behaviours:

- `my-cli` checks whether the current user sponsors you and, if not, prints a link to contribute;
- `my-cli login` signs the user in with GitHub or Open Collective;
- `my-cli sponsor` opens the checkout and waits until the new contribution shows up.

Pick your language below; the choice is remembered across the docs. Every program on this page compiles
as-is against the SDK.

## Install

No SDK has been released to npm, NuGet, PyPI or crates.io yet, so install it from the repository. Don't
install `@sponsorkit/sdk`, `Sponsorkit` or `sponsorkit` from a registry until the first release is announced:
those names may not be reserved yet. [Install](../install/index.md) explains why, and lists the registry
commands to use after the release.

:::tabs
```bash tab="JavaScript" key="js"
git clone https://github.com/sponsorkit/sponsorkit.io.git
(cd sponsorkit.io && bun install && bun run --cwd sdks/js build && cd sdks/js && npm pack)
mkdir my-cli && cd my-cli && npm init -y
npm install ../sponsorkit.io/sdks/js/sponsorkit-sdk-0.1.0.tgz
```

```bash tab=".NET" key="dotnet"
git clone https://github.com/sponsorkit/sponsorkit.io.git
dotnet pack sponsorkit.io/sdks/dotnet/src/Sponsorkit -c Release -o ~/local-nuget -p:Version=0.1.0-local.1
dotnet new console -n my-cli && cd my-cli
dotnet add package Sponsorkit --version 0.1.0-local.1 --source ~/local-nuget
```

```bash tab="Python" key="python"
python -m pip install "sponsorkit @ git+https://github.com/sponsorkit/sponsorkit.io@main#subdirectory=sdks/python"
```

```bash tab="Go" key="go"
go mod init example.com/my-cli
go get github.com/sponsorkit/sponsorkit.io/sdks/go@main
```

```bash tab="Rust" key="rust"
cargo new my-cli && cd my-cli
cargo add sponsorkit --git https://github.com/sponsorkit/sponsorkit.io
cargo add tokio --features macros,rt-multi-thread
```
:::

Building the JavaScript SDK needs [Bun](https://bun.sh). [Build from source](../install/from-source.md) has
more detail on each recipe, including uv, Poetry, local checkouts and pinning a commit.

## Write the program

Replace `octocat` and `my-collective` with the accounts you receive sponsorships on. You need at least one of
the two.

::::tabs
:::tab[JavaScript]{key="js"}
Works in Node 20+, Bun and Deno. The file is plain JavaScript and also valid TypeScript.

```js title="my-cli.mjs"
import { Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({
  github: "octocat",               // your GitHub Sponsors login
  opencollective: "my-collective", // and/or your Open Collective slug
  appName: "my-cli",               // shown on the consent screen
});

const command = process.argv[2];

if (command === "login") {
  // Opens the browser (or prints a link over SSH) and waits for the supporter.
  const fc = await sk.signIn();
  console.log(`Signed in. Active contributions: ${fc.active().length}`);
} else if (command === "sponsor") {
  // Signs in if needed, opens the checkout, then waits for the new contribution.
  const result = await sk.openCheckout({ frequency: "monthly", amount: 500 });
  console.log(result.status === "contributed" ? "Thank you!" : "No new contribution detected yet.");
} else {
  // Never throws because of the network: it serves the local cache instead.
  const fc = await sk.getFinancialContribution();
  const supporter = fc.active().some((c) => c.amount.currency === "USD" && c.amount.value >= 500);
  if (!supporter) {
    console.error(`Enjoying my-cli? Support it: ${sk.checkoutUrl({ frequency: "monthly" })}`);
    if (!fc.signedIn) console.error("Already a sponsor? Run `my-cli login`.");
  }
}
```

```bash title="Terminal"
node my-cli.mjs          # or: bun my-cli.mjs
node my-cli.mjs login
```

In a browser app, import from `@sponsorkit/sdk` instead and call `signIn()` from a click handler: sign-in then
uses a popup, and `appName` isn't needed because the consent screen shows your site's origin.
:::

:::tab[.NET]{key="dotnet"}
Replace the generated `Program.cs`. The project template enables implicit usings, so `System` and
`System.Linq` are already imported.

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "octocat",               // your GitHub Sponsors login
    OpenCollective = "my-collective", // and/or your Open Collective slug
    AppName = "my-cli",               // shown on the consent screen
});

var command = args.Length > 0 ? args[0] : null;

if (command == "login")
{
    // Opens the browser (or prints a link over SSH) and waits for the supporter.
    var fc = await sk.SignInAsync();
    Console.WriteLine($"Signed in. Active contributions: {fc.Active().Count}");
}
else if (command == "sponsor")
{
    // Signs in if needed, opens the checkout, then waits for the new contribution.
    var result = await sk.OpenCheckoutAsync(new CheckoutOptions { Frequency = Frequencies.Monthly, Amount = 500 });
    Console.WriteLine(result.Status == CheckoutStatus.Contributed ? "Thank you!" : "No new contribution detected yet.");
}
else
{
    // Never throws because of the network: it serves the local cache instead.
    var fc = await sk.GetFinancialContributionAsync();
    var supporter = fc.Active().Any(c => c.Amount.Currency == "USD" && c.Amount.Value >= 500);
    if (!supporter)
    {
        Console.Error.WriteLine($"Enjoying my-cli? Support it: {sk.CheckoutUrl(new CheckoutUrlOptions { Frequency = Frequencies.Monthly })}");
        if (!fc.SignedIn) Console.Error.WriteLine("Already a sponsor? Run `my-cli login`.");
    }
}
```

```bash title="Terminal"
dotnet run
dotnet run -- login
```
:::

:::tab[Python]{key="python"}
Every blocking method also has an async twin with an `a` prefix, such as `await sk.aget_financial_contribution()`.

```python title="my_cli.py"
import sys

from sponsorkit import Sponsorkit

sk = Sponsorkit(
    github="octocat",  # your GitHub Sponsors login
    opencollective="my-collective",  # and/or your Open Collective slug
    app_name="my-cli",  # shown on the consent screen
)

command = sys.argv[1] if len(sys.argv) > 1 else None

if command == "login":
    # Opens the browser (or prints a link over SSH) and waits for the supporter.
    fc = sk.sign_in()
    print(f"Signed in. Active contributions: {len(fc.active())}")
elif command == "sponsor":
    # Signs in if needed, opens the checkout, then waits for the new contribution.
    result = sk.open_checkout(frequency="monthly", amount=500)
    print("Thank you!" if result.status == "contributed" else "No new contribution detected yet.")
else:
    # Never raises because of the network: it serves the local cache instead.
    fc = sk.get_financial_contribution()
    supporter = any(c.amount.currency == "USD" and c.amount.value >= 500 for c in fc.active())
    if not supporter:
        print(f"Enjoying my-cli? Support it: {sk.checkout_url(frequency='monthly')}", file=sys.stderr)
        if not fc.signed_in:
            print("Already a sponsor? Run `my-cli login`.", file=sys.stderr)
```

```bash title="Terminal"
python my_cli.py
python my_cli.py login
```
:::

:::tab[Go]{key="go"}
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
		GitHub:         "octocat",       // your GitHub Sponsors login
		OpenCollective: "my-collective", // and/or your Open Collective slug
		AppName:        "my-cli",        // shown on the consent screen
	})
	if err != nil {
		log.Fatal(err) // invalid configuration only
	}

	command := ""
	if len(os.Args) > 1 {
		command = os.Args[1]
	}

	switch command {
	case "login":
		// Opens the browser (or prints a link over SSH) and waits for the supporter.
		fc, err := sk.SignIn(ctx)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Println("Signed in. Active contributions:", len(fc.Active()))
	case "sponsor":
		// Signs in if needed, opens the checkout, then waits for the new contribution.
		res, err := sk.OpenCheckout(ctx, sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly, Amount: 500})
		if err != nil {
			log.Fatal(err)
		}
		if res.Status == sponsorkit.CheckoutContributed {
			fmt.Println("Thank you!")
		} else {
			fmt.Println("No new contribution detected yet.")
		}
	default:
		// Network problems never return an error: the local cache is served instead.
		fc, err := sk.GetFinancialContribution(ctx)
		if err != nil {
			log.Fatal(err)
		}
		supporter := false
		for _, c := range fc.Active() {
			if c.Amount.Currency == "USD" && c.Amount.Value >= 500 {
				supporter = true
			}
		}
		if !supporter {
			link, _ := sk.CheckoutURL(sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly})
			fmt.Fprintln(os.Stderr, "Enjoying my-cli? Support it:", link)
			if !fc.SignedIn {
				fmt.Fprintln(os.Stderr, "Already a sponsor? Run `my-cli login`.")
			}
		}
	}
}
```

```bash title="Terminal"
go run .
go run . login
```
:::

:::tab[Rust]{key="rust"}
The SDK is async and runs on Tokio, which is why the install step added `tokio` with the `macros` feature.

```rust title="src/main.rs"
use sponsorkit::{CheckoutOptions, CheckoutOutcome, Frequency, GetOptions, Options, SignInOptions, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),               // your GitHub Sponsors login
        opencollective: Some("my-collective".into()), // and/or your Open Collective slug
        app_name: Some("my-cli".into()),              // shown on the consent screen
        ..Default::default()
    })?; // errors only on invalid configuration

    match std::env::args().nth(1).as_deref() {
        Some("login") => {
            // Opens the browser (or prints a link over SSH) and waits for the supporter.
            let fc = sk.sign_in(SignInOptions::default()).await?;
            println!("Signed in. Active contributions: {}", fc.active().len());
        }
        Some("sponsor") => {
            // Signs in if needed, opens the checkout, then waits for the new contribution.
            let options = CheckoutOptions { frequency: Some(Frequency::Monthly), amount: Some(500), ..Default::default() };
            match sk.open_checkout(options).await? {
                CheckoutOutcome::Contributed { .. } => println!("Thank you!"),
                CheckoutOutcome::Unknown => println!("No new contribution detected yet."),
            }
        }
        _ => {
            // Network problems never return an error: the local cache is served instead.
            let fc = sk.get_financial_contribution(GetOptions::default()).await?;
            let supporter = fc.active().iter().any(|c| c.amount.currency == "USD" && c.amount.value >= 500);
            if !supporter {
                let options = CheckoutOptions { frequency: Some(Frequency::Monthly), ..Default::default() };
                eprintln!("Enjoying my-cli? Support it: {}", sk.checkout_url(&options)?);
                if !fc.signed_in {
                    eprintln!("Already a sponsor? Run `my-cli login`.");
                }
            }
        }
    }
    Ok(())
}
```

```bash title="Terminal"
cargo run
cargo run -- login
```
:::
::::

## Try it without signing in

Mock mode returns realistic data without touching the network or the disk, in every SDK. Set
`SPONSORKIT_MOCK` and run the program as above:

```bash title="Terminal"
SPONSORKIT_MOCK=signed-out node my-cli.mjs   # or: dotnet run, python my_cli.py, go run ., cargo run
```

| `SPONSORKIT_MOCK` | The supporter | `my-cli` prints |
|---|---|---|
| `signed-out` | Not signed in | The link and the login hint |
| `none` | Signed in, no contributions | The link |
| `active-monthly` | Signed in, an active $5/month sponsorship | Nothing |

In mock mode `login` and `sponsor` succeed
immediately, and `sponsor` simulates a new contribution. The [mock mode guide](../guides/mock-mode.md) lists every
preset and shows how to pass your own contributions in tests.

## What happened

- **No network when signed out.** The plain `my-cli` run answers instantly for users who never signed in.
- **One sign-in.** `login` showed a consent screen that names your accounts and `my-cli` (labelled "says it is",
  because a native app can't prove its name). The session token is stored in the user's config directory; see
  [Sign-in & sessions](../concepts/sessions.md).
- **Cheap checks.** Later runs are answered from the local cache for an hour; see
  [Caching & freshness](../concepts/caching.md).
- **Your rule.** "At least $5 a month on GitHub" is just one example. The result has every contribution's
  provider, amount, frequency and status; see the [contribution shape](../concepts/contributions.md).

## Next steps

- Show the reminder only every N runs, and never in CI: the [nag helper](../guides/nag.md).
- Understand checkout detection and its limits: the [checkout guide](../guides/checkout.md).
- Need a trustworthy answer on your server? [Backend verification](../guides/backend-verification.md).
- Your language's specifics: the [language guides](../languages/index.md).
