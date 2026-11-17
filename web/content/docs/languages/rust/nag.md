---
title: Nag in Rust
description: Ask for support every N runs or every N days with Sponsorkit::nag, never in CI or scripts, and never someone who already contributes.
sidebar_label: Nag
order: 50
---

A nag is a gentle "Enjoying this? Consider supporting it" message. `sk.nag(...)` gives you a `Nag` that remembers
how often your app ran and when the message was last shown. It decides *when*; you decide *what* to print and
*who* should see it. Sponsorkit never prints anything itself and never signs anyone in from a nag.

```rust title="src/main.rs"
use sponsorkit::{CheckoutOptions, Frequency, NagOptions, Options, Sponsorkit, parse_iso_duration};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options { github: Some("octocat".into()), app_name: Some("my-cli".into()), ..Default::default() })?;

    let nag = sk.nag(NagOptions::new("my-cli", 10).or_every(parse_iso_duration("P7D")?));
    if nag.due(|fc| fc.active().is_empty()).await {
        let url = sk.checkout_url(&CheckoutOptions { frequency: Some(Frequency::Monthly), ..Default::default() })?;
        eprintln!("Enjoying my-cli? Support it: {url}");
        nag.shown().await;
    }
    Ok(())
}
```

Print to stderr, as above, so the message never ends up in output that another program parses.

## Options

| `NagOptions` | Type | Default | Meaning |
|---|---|---|---|
| `id` | `String` | required | A stable name for this nag. Several nags with different ids can coexist; each has its own counters. |
| `every` | `u64` | required | Due after this many runs since it was last shown. |
| `or_every` | `Option<Duration>` | `None` | Or due when it was last shown at least this long ago. |

`NagOptions::new(id, every)` sets the first two, and the builder method `.or_every(duration)` the third. The
fields are public too. [`parse_iso_duration`](/docs/reference/rust#parse_iso_duration) turns ISO 8601 durations
such as `"P7D"`, `"PT12H"`, `"P1W"` or `"P1DT2H30M"` into a `Duration`, which is handy when the period comes from a config file; years and
months aren't supported because they have no fixed length. `Duration::from_secs(7 * 24 * 3600)` works just as well.

## When it's due

```text
due = predicate(result) && (runs >= every || time since last shown >= or_every)
```

- **A run is a process.** The counter goes up once per process and nag id, on the first `due` call, even when
  the result is `false`. Calling `due` again in the same process doesn't count another run.
- **The predicate is your rule.** It receives the current [`ContributionResult`](contributions.md) (from the cache
  when it's fresh), and should return `true` for people you'd like to ask. `|fc| fc.active().is_empty()` asks
  everyone without an active contribution, including signed-out users.
- **`shown()` resets both counters**: it sets runs to 0 and records the current time. Call it only when you
  actually displayed the message.
- `or_every` only counts after the nag was shown once. A brand-new install is due after `every` runs.

The counters live in the [state file](platform-notes.md#where-state-is-kept), next to the session, so they
survive restarts and are shared by every program that uses the same targets on that machine.

## When it's never due

`due` returns `false`, without calling the predicate, when:

- `SPONSORKIT_DISABLE` is set (the counter doesn't move either);
- `SPONSORKIT_NO_NAG` or `CI` is set;
- stdout or stderr isn't a terminal, for example when output is piped or the app runs from cron. Override the
  detection with `Options::interactive`, for example `Some(true)` in a GUI app that shows the message in a window.

Errors read as `false` too: a nag never breaks your app, and `due` returns a plain `bool`.

### Forcing it

`due_with(predicate, DueOptions { force: true })` skips only the environment and terminal checks:
`SPONSORKIT_NO_NAG`, `CI` and the TTY detection. Everything else still applies. The predicate is still called,
and the nag is still only due after `every` runs (or `or_every` since it was last shown), so a forced nag returns
`false` on most runs. `SPONSORKIT_DISABLE` still wins. Use it when you show the message somewhere other than the
terminal and still want the usual rhythm, for example in a window or a log your app writes.

For a flag that should *always* print the message, don't route it through the nag at all: check the flag first,
and only ask the nag otherwise.

```rust title="src/main.rs"
use sponsorkit::{NagOptions, Options, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options { github: Some("octocat".into()), ..Default::default() })?;
    let wants_hint = std::env::args().any(|a| a == "--support");

    // `my-cli --support` always prints the message; otherwise the nag decides (every 20 runs, terminals only).
    let nag = sk.nag(NagOptions::new("support-hint", 20));
    if wants_hint || nag.due(|fc| fc.active().is_empty()).await {
        eprintln!("my-cli is maintained in spare time. A sponsorship keeps it going.");
        nag.shown().await;
    }
    Ok(())
}
```

`wants_hint || ...` short-circuits, so with `--support` the nag isn't consulted and the run isn't counted;
`shown()` still resets the counter, so the regular nag won't repeat the message right after.

## It never signs anyone in

`due` reads contributions like `get_financial_contribution` does: from the cache or the API when signed in, and
without any request when signed out (apart from the opt-in [dev-time target check](configuration.md#the-dev-time-target-check)). It never opens a browser. Point people who already contribute to your
`login` command in the message, so they can make it go away for good.

## Testing a nag

In mock mode, nag state lives in memory per client, so each new client starts from zero. To test the
"every N runs" logic for real, use a temporary `storage_dir` and `restart: true` to simulate separate
processes; see [testing nags](testing.md#testing-nags). More background is in the [nag guide](../../guides/nag.md).
