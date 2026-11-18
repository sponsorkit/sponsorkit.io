// Smoke test of the built ESM package under plain Node: every entry loads and works offline.
import assert from "node:assert/strict";
import { Sponsorkit as BrowserSponsorkit, SponsorkitError } from "@sponsorkit/sdk";
import * as elements from "@sponsorkit/sdk/elements";
import { fileStorage, Sponsorkit, targetsHash } from "@sponsorkit/sdk/node";
import { verifySession } from "@sponsorkit/sdk/server";

const sk = new Sponsorkit({ github: "octocat", mock: "active-monthly", env: {} });
const fc = await sk.getFinancialContribution();
assert.equal(fc.active().length, 1);
assert.equal(fc.mock, true);
assert.equal(await targetsHash("github:octocat"), "0309e87b72e9ebbb324075c26f58478bf2aca6c8cbc26bae3bb2bc74080640f9");
assert.equal(typeof fileStorage, "function");
assert.match(
  new BrowserSponsorkit({ github: "octocat", env: {} }).checkoutUrl(),
  /^https:\/\/sponsorkit\.github\.io\/sponsorkit\.io\/checkout\/\?targets=github%3Aoctocat$/,
);
assert.throws(
  () => new Sponsorkit({ github: "-bad-" }),
  (e) => e instanceof SponsorkitError && e.code === "invalid_config",
);
await assert.rejects(verifySession("sks_x", { github: "octocat" }, { fetch: async () => new Response("", { status: 401 }) }), { code: "session_invalid" });
assert.equal(typeof elements.defineElements, "function");
console.log("dist ESM smoke test passed");
