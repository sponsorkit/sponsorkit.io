/** Code samples shared by the landing page and the docs. API names follow SPEC §7.1 and §7.8. */

export const heroSnippet = `import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "your-login", opencollective: "your-collective" });
const fc = await sk.getFinancialContribution();

if (fc.signedIn && fc.active().length === 0) showSupportBanner();`;

export const quickstart = {
  install: `npm install @sponsorkit/sdk`,
  code: `const sk = new Sponsorkit({ github: "your-login" });
const fc = await sk.getFinancialContribution();
button.onclick = () => sk.openCheckout({ frequency: "monthly", amount: 500 });`,
};

export const languages = [
  {
    id: "js",
    name: "JavaScript / TypeScript",
    install: "npm install @sponsorkit/sdk",
    installLang: "bash",
    lang: "ts",
    file: "app.ts",
    runtime: "Node 20+, Bun, Deno and evergreen browsers. No runtime dependencies.",
    code: `import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({
  github: "mathiaslorenzen",        // at least one target
  opencollective: "sponsorkit",
  appName: "my-cli",                // shown on the consent page (native apps)
});

// Never throws because of the network; see "Error contract".
const fc = await sk.getFinancialContribution();

if (!fc.signedIn) {
  await sk.signIn();                // popup in browsers, loopback or paste-back elsewhere
} else if (!fc.active().some(c => c.amount.currency === "USD" && c.amount.value >= 500)) {
  showAd();
}

// From a click handler in the browser:
const result = await sk.openCheckout({ frequency: "monthly", amount: 500 });
if (result.status === "contributed") thankUser(result.contribution);`,
  },
  {
    id: "dotnet",
    name: ".NET",
    install: "dotnet add package Sponsorkit",
    installLang: "bash",
    lang: "csharp",
    file: "Program.cs",
    runtime: "netstandard2.0 and net8.0.",
    code: `using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "mathiaslorenzen",
    OpenCollective = "sponsorkit",
    AppName = "my-cli",
});

var fc = await sk.GetFinancialContributionAsync(cancellationToken);

if (!fc.SignedIn)
{
    await sk.SignInAsync(cancellationToken);      // loopback, or paste-back over SSH
}
else if (!fc.Active().Any(c => c.Amount.Currency == "USD" && c.Amount.Value >= 500))
{
    Console.Error.WriteLine($"Enjoying my-cli? {sk.CheckoutUrl(frequency: Frequency.Monthly)}");
}`,
  },
  {
    id: "python",
    name: "Python",
    install: "pip install sponsorkit",
    installLang: "bash",
    lang: "python",
    file: "app.py",
    runtime: "Python 3.10+. Depends on httpx.",
    code: `from sponsorkit import Sponsorkit

sk = Sponsorkit(github="mathiaslorenzen", opencollective="sponsorkit", app_name="my-cli")

fc = sk.get_financial_contribution()          # or: await sk.aget_financial_contribution()

if not fc.signed_in:
    sk.sign_in()                              # loopback, or paste-back over SSH
elif not any(c.amount.currency == "USD" and c.amount.value >= 500 for c in fc.active()):
    print(f"Enjoying my-cli? {sk.checkout_url(frequency='monthly')}", file=sys.stderr)`,
  },
  {
    id: "go",
    name: "Go",
    install: "go get github.com/sponsorkit/sponsorkit.io/sdks/go",
    installLang: "bash",
    lang: "go",
    file: "main.go",
    runtime: "Go 1.23+. Standard library only.",
    code: `import sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"

sk, err := sponsorkit.New(sponsorkit.Options{
	GitHub:         "mathiaslorenzen",
	OpenCollective: "sponsorkit",
	AppName:        "my-cli",
})
if err != nil {
	log.Fatal(err) // invalid configuration only
}

fc := sk.GetFinancialContribution(ctx) // never fails because of the network

if !fc.SignedIn {
	_ = sk.SignIn(ctx) // loopback, or paste-back over SSH
} else if len(fc.Active()) == 0 {
	fmt.Fprintln(os.Stderr, "Enjoying my-cli? "+sk.CheckoutURL(sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly}))
}`,
  },
  {
    id: "rust",
    name: "Rust",
    install: "cargo add sponsorkit",
    installLang: "bash",
    lang: "rust",
    file: "main.rs",
    runtime: "MSRV 1.85. Uses reqwest (rustls), serde and tokio.",
    code: `use sponsorkit::{Options, Sponsorkit};

let sk = Sponsorkit::new(Options {
    github: Some("mathiaslorenzen".into()),
    opencollective: Some("sponsorkit".into()),
    app_name: Some("my-cli".into()),
    ..Default::default()
})?; // errors only on invalid configuration

let fc = sk.get_financial_contribution().await; // never fails because of the network

if !fc.signed_in {
    sk.sign_in().await?; // loopback, or paste-back over SSH
} else if fc.active().is_empty() {
    eprintln!("Enjoying my-cli? {}", sk.checkout_url(Default::default()));
}`,
  },
] as const;

export const resultShape = `{
  "signedIn": true,
  "disabled": false,
  "mock": false,
  "targets": ["github:mathiaslorenzen", "opencollective:sponsorkit"],
  "supporter": {
    "id": "sup_…",                       // pairwise: stable per (target set, identity)
    "identities": [{ "provider": "github", "id": "583231", "handle": "alice", "needsReconnect": false }]
  },
  "contributions": [{
    "id": "con_github_…",
    "provider": "github",
    "target": "github:mathiaslorenzen",
    "sponsor": { "type": "user", "provider": "github", "id": "583231", "handle": "alice" },
    "via": "direct",                     // direct | organization
    "kind": "recurring",                 // recurring | one_time
    "frequency": "monthly",              // one_time | monthly | yearly
    "status": "active",
    "amount": { "value": 500, "currency": "USD" },   // minor units
    "tier": { "id": "ST_…", "name": "Coffee" },
    "flags": [],                         // via_patreon
    "private": false,
    "startedAt": "2026-03-01T10:00:00Z",
    "endedAt": null,
    "lastChargedAt": null,               // Open Collective only
    "nextChargeAt": null,                // Open Collective only
    "totalContributed": null             // Open Collective only
  }],
  "fetchedAt": "2026-11-16T18:00:00Z",
  "stale": false,
  "fromCache": false
}`;

export const helpersSnippet = `fc.active();                 // status === "active"
fc.recurring();              // kind === "recurring"
fc.oneTime();                // kind === "one_time"
fc.byProvider("github");     // one provider
fc.direct();                 // drops organization sponsorships

// Helpers filter; they never sum across providers or currencies. Your rule decides:
const supporter = fc.active().some(c => c.amount.currency === "USD" && c.amount.value >= 500);`;

export const orgSnippet = `const personal = fc.direct().active();         // only the user's own sponsorships
const viaOrg = fc.active().filter(c => c.via === "organization");
// c.sponsor is the organization: { type: "organization", handle: "acme", ... }`;

export const cacheSnippet = `const sk = new Sponsorkit({ github: "your-login", cacheTtl: 3600 }); // seconds, minimum 60

await sk.getFinancialContribution();                 // served from cache when fresh
await sk.getFinancialContribution({ cacheTtl: 0 });  // force a live check (rate limited to 1/min)`;

export const checkoutSnippet = `// Browser: call synchronously from a click handler so the popup isn't blocked.
button.onclick = async () => {
  const r = await sk.openCheckout({ frequency: "monthly", amount: 500, currency: "USD" });
  if (r.status === "contributed") celebrate(r.contribution);
  // r.status === "unknown": the payment may still be processing; check again later.
};

// Anywhere (README, CLI output): an offline-safe link without sign-in.
const url = sk.checkoutUrl({ frequency: "monthly", amount: 500 });`;

export const nagSnippet = `const nag = sk.nag({ id: "my-cli", every: 10, orEvery: "P7D" });

if (await nag.due(fc => fc.active().length === 0)) {
  console.error(\`❤️ Enjoying my-cli? Support it: \${sk.checkoutUrl({ frequency: "monthly" })}\`);
  nag.shown();
}`;

export const mockSnippet = `new Sponsorkit({ github: "x", mock: "active-monthly" });
// presets: signed-out | none | active-monthly | one-time | cancelled | org

new Sponsorkit({ github: "x", mock: { contributions: [/* contribution objects */] } });`;

export const mockEnv = `SPONSORKIT_MOCK=active-monthly my-cli   # same presets, no code change
SPONSORKIT_DISABLE=1 my-cli             # no network, no disk, no nags`;

export const verifySnippet = `import { verifySession } from "@sponsorkit/sdk/server";

// The frontend sends its session token (sks_…) to your backend, e.g. in a header.
const fc = await verifySession(token, { github: "mathiaslorenzen" });
// Throws if the session is invalid or was issued for different targets.

if (fc.active().length > 0) unlockPremium(fc.supporter.id); // pairwise, stable id`;

export const verifyCurl = `curl https://sponsorkit.io/api/v1/contributions \\
  -H "Authorization: Bearer sks_…"`;

export const selfHostSnippet = `# Worker secrets (Cloudflare)
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put OPENCOLLECTIVE_CLIENT_ID
wrangler secret put OPENCOLLECTIVE_CLIENT_SECRET
wrangler secret put SEALING_KEYS      # [{"id":1,"key":"<32 bytes, base64url>"}]
wrangler secret put PAIRWISE_KEY      # HMAC key for pairwise supporter ids

bun run --filter @sponsorkit/web build   # static pages → web/out
wrangler deploy`;

export const selfHostClient = `new Sponsorkit({ github: "your-login", apiBaseUrl: "https://sponsors.example.com" });`;
