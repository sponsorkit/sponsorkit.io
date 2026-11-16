// Smoke test of the built CommonJS package under plain Node.
const assert = require("node:assert/strict");
const { Sponsorkit, SponsorkitError } = require("@sponsorkit/sdk/node");
const { verifySession } = require("@sponsorkit/sdk/server");
const core = require("@sponsorkit/sdk");

(async () => {
  const sk = new Sponsorkit({ opencollective: "my-collective", mock: "one-time", env: {} });
  const fc = await sk.getFinancialContribution();
  assert.equal(fc.oneTime().length, 1);
  assert.equal(fc.contributions[0].target, "opencollective:my-collective");
  assert.ok(new core.Sponsorkit({ github: "x", env: {} }));
  assert.throws(
    () => new Sponsorkit({}),
    (e) => e instanceof SponsorkitError && e.code === "invalid_config",
  );
  assert.equal(typeof verifySession, "function");
  console.log("dist CJS smoke test passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
