import { expect, test } from "bun:test";
import pkg from "../../package.json";
import { DEFAULT_SITE_BASE_URL } from "../../src/util";

// The apex sponsorkit.io is no longer served (SPEC §13); the npm homepage must point at the site.
test("package.json homepage points at the GitHub Pages site", () => {
  expect(pkg.homepage).toBe(`${DEFAULT_SITE_BASE_URL}/`);
});
