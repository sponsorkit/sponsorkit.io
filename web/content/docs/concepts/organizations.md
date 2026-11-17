---
title: Organization sponsorships
description: Contributions made through an organization the supporter belongs to or administers, how to recognize them and how to decide whether they count.
order: 50
---

Many companies sponsor open source as an organization rather than through an employee's personal account.
Sponsorkit reports those contributions too, so a developer at a sponsoring company can be recognized as a
supporter. Whether that counts is your decision.

## What is included

| Provider | An organization contribution is returned when |
|---|---|
| GitHub | An organization the supporter is a **member** of sponsors one of your targets. |
| Open Collective | An organization or collective the supporter **administers** contributes to one of your targets. |

Such a contribution has `via: "organization"`, and its `sponsor` is the organization, not the person:

```jsonc
"sponsor": { "type": "organization", "provider": "github", "id": "9919", "handle": "acme" },
"via": "organization"
```

Private organization sponsorships may only be visible to the organization's admins, so a regular member
doesn't always see them.

## Deciding what counts

`direct()` drops organization contributions; filtering on `via` keeps only them:

:::tabs
```ts
const personal = fc.direct().filter((c) => c.status === "active");
const viaOrg = fc.active().filter((c) => c.via === "organization");
for (const c of viaOrg) console.log(`Sponsored by ${c.sponsor.handle ?? c.sponsor.id}`);
```

```csharp
var personal = fc.Direct().Where(c => c.IsActive).ToList();
var viaOrg = fc.Active().Where(c => c.Via == "organization");
foreach (var c in viaOrg) Console.WriteLine($"Sponsored by {c.Sponsor.Handle ?? c.Sponsor.Id}");
```

```python
personal = [c for c in fc.direct() if c.status == "active"]
via_org = [c for c in fc.active() if c.via == "organization"]
for c in via_org:
    print(f"Sponsored by {c.sponsor.handle or c.sponsor.id}")
```

```go
for _, c := range fc.Active() {
	if c.Via == sponsorkit.ViaOrganization {
		handle := c.Sponsor.ID
		if c.Sponsor.Handle != nil {
			handle = *c.Sponsor.Handle
		}
		fmt.Println("Sponsored by", handle)
	}
}
```

```rust
let personal: Vec<_> = fc.direct().into_iter().filter(|c| c.status == Status::Active).collect();
for c in fc.active().into_iter().filter(|c| c.via == Via::Organization) {
    println!("Sponsored by {}", c.sponsor.handle.as_deref().unwrap_or(&c.sponsor.id));
}
```
:::

Common policies:

- **Count everything.** Anyone whose company sponsors you gets the supporter experience. Simple, and it rewards
  the company's decision.
- **Count only `direct()`.** Personal perks for personal support.
- **Mix.** Hide nags for organization members, but keep a personal "supporter" badge for direct sponsors.

One organization sponsorship can show up for every member who signs in, so organization contributions don't
tell you how many people are paying. They tell you this person belongs to an organization that is.
