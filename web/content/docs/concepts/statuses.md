---
title: Statuses
description: The eight contribution statuses, how GitHub Sponsors and Open Collective states map to them, and which ones to count.
order: 40
---

Every contribution has one of eight statuses, the same for both providers:

| Status | Meaning | GitHub | Open Collective |
|---|---|---|---|
| `active` | Recurring and current | Recurring, `isActive` | `ACTIVE` |
| `paid` | A completed one-time contribution | `isOneTimePayment` | `PAID` |
| `paused` | Recurring, paused | — | `PAUSED` |
| `cancelled` | Ended | Recurring, not active | `CANCELLED`, `EXPIRED` |
| `refunded` | Refunded | — | `REFUNDED` |
| `disputed` | Charged back | — | `DISPUTED` |
| `failed` | Payment failed or rejected | — | `ERROR`, `REJECTED` |
| `pending` | Not settled yet | — | `NEW`, `PENDING`, `PROCESSING`, `REQUIRE_CLIENT_CONFIRMATION`, `IN_REVIEW` |

Open Collective statuses come from the order itself, never from membership. A provider value Sponsorkit doesn't
know yet maps to `pending`.

## Provider quirks

- **GitHub reports pending cancellations only through webhooks**, which Sponsorkit doesn't use. A GitHub
  sponsorship the supporter has cancelled stays `active` until it actually ends.
- **GitHub sponsorships paid through Patreon** carry the `via_patreon` flag.
- **One-time contributions are never `active`.** A GitHub or Open Collective one-time payment is `paid`; use
  `oneTime()` or `status === "paid"` if past one-time support should count.

## Which statuses to count

`active()` keeps only `active`, which is the right default for "is this person supporting me right now?". Some
choices you might make differently:

- **Thank past supporters** by also counting `paid` and `cancelled`.
- **Be generous with `pending`**: a brand-new Open Collective order can be `pending` for a short while.
- **Ignore `refunded`, `disputed` and `failed`**: no money arrived.

The [contribution shape](contributions.md#helpers) page shows how to combine helpers into your own rule in each
language.
