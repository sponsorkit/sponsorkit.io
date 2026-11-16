// CommonJS resolution of the published .d.cts files.
import sdk = require("@sponsorkit/sdk/node");
import server = require("@sponsorkit/sdk/server");

const sk = new sdk.Sponsorkit({ github: "octocat" });
void sk.checkoutUrl({ provider: "github" });
void server.verifySession("sks_", "github:octocat");
