// Compiles against the published .d.ts files (ESM resolution) with no other packages: they must be self-contained.
import { Sponsorkit as BrowserSponsorkit, type ContributionResult, type SponsorkitError } from "@sponsorkit/sdk";
import { defineElements, SponsorkitButtonElement } from "@sponsorkit/sdk/elements";
import { Sponsorkit, type SponsorkitOptions } from "@sponsorkit/sdk/node";
import { verifySession } from "@sponsorkit/sdk/server";

const opts: SponsorkitOptions = { github: "octocat", appName: "cli", signInMethod: "paste", storageDir: "/tmp/x" };
const sk = new Sponsorkit(opts);
const fc = await sk.getFinancialContribution({ cacheTtl: 0 });
const plain: ContributionResult = fc;
const n: number = fc.active().length + fc.direct().length + fc.byProvider("github").length;
const r = await sk.openCheckout({ frequency: "monthly", amount: 500, signal: new AbortController().signal });
if (r.status === "contributed") r.contribution.amount.value.toFixed();
const due: boolean = await sk.nag({ id: "x", every: 10, orEvery: "P7D" }).due((f) => f.active().length === 0, { force: false });
new BrowserSponsorkit({ github: "octocat", returnTo: "https://app.example" }).signIn({ provider: "github" });
const v = await verifySession("sks_", { github: "octocat" });
const e = null as unknown as SponsorkitError;
const code: "invalid_config" | string = e.code;
const retryAfter: number | undefined = e.retryAfter;
defineElements();
void [plain, n, due, v, code, retryAfter, SponsorkitButtonElement];
