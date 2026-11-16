# Sponsorkit

Sponsorkit lets open source maintainers build financial contributions straight into their software. There's no account, no API key, no webhooks, and no stored user data.

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "your-login", opencollective: "your-collective" });
const fc = await sk.getFinancialContribution();
if (fc.signedIn && fc.active().length === 0) showAd();
```

It works with GitHub Sponsors and Open Collective. SDKs: JS/TS (`npm i @sponsorkit/sdk`), .NET (`dotnet add package Sponsorkit`), Python (`pip install sponsorkit`), Go (`go get github.com/sponsorkit/sponsorkit.io/sdks/go`) and Rust (`cargo add sponsorkit`). With them you can:

- check what the current user has contributed (`getFinancialContribution()`),
- send users to contribute (`openCheckout()`),
- gate features, show nag messages or ads based on contribution.

## Repository

| Path | What |
|---|---|
| `app/` | The stateless Cloudflare Worker: API, OAuth, sealed sessions |
| `web/` | The static site: landing page, docs, `/connect`, `/checkout` |
| `packages/shared/` | Shared Zod schemas and types |
| `sdks/{js,dotnet,python,go,rust}/` | The SDKs |
| `sdks/conformance/` | The conformance kit every SDK passes |
| `docs/SPEC.md`, `docs/PROTOCOL.md` | The design and the normative wire protocol |

**Development:** `bun install`, then run each component's tests. The commands are in `.github/workflows/ci.yml`.

**Going live:** see `docs/SPEC.md` §13.
