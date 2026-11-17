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

## Documentation

The full documentation lives at **[sponsorkit.io/docs](https://sponsorkit.io/docs)**. Good places to start:

- [Getting started](https://sponsorkit.io/docs/getting-started) and the five-language [quickstart](https://sponsorkit.io/docs/getting-started/quickstart)
- [Install](https://sponsorkit.io/docs/install): how to fetch the SDK for each language, from a package registry or from source
- [Concepts](https://sponsorkit.io/docs/concepts) and [guides](https://sponsorkit.io/docs/guides)
- The [API reference](https://sponsorkit.io/docs/reference), generated from each SDK's source

The site is built from `web/` by `.github/workflows/ci.yml`, with the API reference generated from each SDK, and deployed together with the Worker to Cloudflare on every push to `main` (once deploys are enabled; see `docs/SPEC.md` §13). To work on the docs, see `web/content/docs/CONTRIBUTING-DOCS.md`.

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
