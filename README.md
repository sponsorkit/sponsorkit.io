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

The full documentation lives at **[sponsorkit.github.io/sponsorkit.io/docs](https://sponsorkit.github.io/sponsorkit.io/docs/)**. Good places to start:

- [Getting started](https://sponsorkit.github.io/sponsorkit.io/docs/getting-started/) and the five-language [quickstart](https://sponsorkit.github.io/sponsorkit.io/docs/getting-started/quickstart/)
- [Install](https://sponsorkit.github.io/sponsorkit.io/docs/install/): how to fetch the SDK for each language, from a package registry or from source
- [Concepts](https://sponsorkit.github.io/sponsorkit.io/docs/concepts/) and [guides](https://sponsorkit.github.io/sponsorkit.io/docs/guides/)
- The [API reference](https://sponsorkit.github.io/sponsorkit.io/docs/reference/), generated from each SDK's source

Sponsorkit runs in two places: the **site** (`web/`: landing page, docs and the consent and checkout pages) is a static export on GitHub Pages at https://sponsorkit.github.io/sponsorkit.io, and the **API** (`app/`) is a Cloudflare Worker at https://api.sponsorkit.io (see `docs/PROTOCOL.md` §0). `.github/workflows/ci.yml` builds the site, with the API reference generated from each SDK, and on every push to `main` deploys it to GitHub Pages and the Worker to Cloudflare (once deploys are enabled; see `docs/SPEC.md` §13). To work on the docs, see `web/content/docs/CONTRIBUTING-DOCS.md`.

## Repository

| Path | What |
|---|---|
| `app/` | The stateless, API-only Cloudflare Worker (`api.sponsorkit.io`): API, OAuth, sealed sessions |
| `web/` | The static site on GitHub Pages: landing page, docs, `/connect/`, `/checkout/` |
| `packages/shared/` | Shared Zod schemas and types |
| `sdks/{js,dotnet,python,go,rust}/` | The SDKs |
| `sdks/conformance/` | The conformance kit every SDK passes |
| `docs/SPEC.md`, `docs/PROTOCOL.md` | The design and the normative wire protocol |

**Development:** `bun install`, then run each component's tests. The commands are in `.github/workflows/ci.yml`.

**Going live:** see `docs/SPEC.md` §13.
