# Sponsorkit

Sponsorkit lets open source maintainers build financial contributions straight into their software. There's no account, no API key and no webhooks.

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "your-login", opencollective: "your-collective" });
const fc = await sk.getFinancialContribution();
if (fc.signedIn && fc.active().length === 0) showAd();
```

It works with GitHub Sponsors and Open Collective. SDKs are planned for JS/TS, .NET, Python, Go and Rust. With them you can:

- check what the current user has contributed (`getFinancialContribution()`),
- send users to contribute (`openCheckout()`),
- gate features, show nag messages or ads based on contribution.

> **Status:** being rebuilt from scratch. See [`docs/SPEC.md`](docs/SPEC.md) for the design.
