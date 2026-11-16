import { expect, test } from "@playwright/test";
import { CHALLENGE, CODE, mockApi, q } from "./fixtures";

const PAGES = [
  "/",
  "/docs",
  `/connect?${q({ targets: "github:octocat,opencollective:sponsorkit", challenge: CHALLENGE, delivery: "loopback", redirect_uri: "http://127.0.0.1:53682/callback", app_name: "a-rather-long-application-name-for-testing" })}`,
  `/checkout?${q({ targets: "github:octocat,opencollective:sponsorkit", frequency: "monthly" })}`,
  `/connect/done#paste=${CODE}`,
  "/checkout/thanks",
  "/nope",
];

test.describe("no horizontal overflow", () => {
  for (const path of PAGES) {
    test(path.split("?")[0]!.split("#")[0]!, async ({ page, context }) => {
      await mockApi(context);
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      const { scroll, client } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(scroll).toBeLessThanOrEqual(client);
    });
  }
});
