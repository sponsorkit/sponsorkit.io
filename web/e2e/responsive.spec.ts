import { expect, test } from "@playwright/test";
import { CHALLENGE, CODE, mockApi, p, q } from "./fixtures";

const PAGES = [
  "/",
  "/docs/",
  "/docs/getting-started/quickstart/",
  "/docs/concepts/error-contract/",
  "/docs/reference/",
  "/docs/reference/js/",
  `/connect/?${q({ targets: "github:octocat,opencollective:sponsorkit", challenge: CHALLENGE, delivery: "loopback", redirect_uri: "http://127.0.0.1:53682/callback", app_name: "a-rather-long-application-name-for-testing" })}`,
  `/checkout/?${q({ targets: "github:octocat,opencollective:sponsorkit", frequency: "monthly" })}`,
  `/connect/done/#paste=${CODE}`,
  "/checkout/thanks/",
  "/nope/",
];

test.describe("no horizontal overflow", () => {
  for (const path of PAGES) {
    test(path.split("?")[0]!.split("#")[0]!, async ({ page, context }) => {
      await mockApi(context);
      await page.goto(p(path));
      await expect(page.locator("h1").first()).toBeVisible();
      const { scroll, client } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(scroll).toBeLessThanOrEqual(client);
    });
  }
});

test.describe("no horizontal overflow on any docs page at 360px", () => {
  test("every page in the search index", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "runs once, in the 360px mobile project");
    test.setTimeout(600_000);
    const index = (await (await request.get(p("/search-index.json"))).json()) as { entries: { u: string; k: string }[] };
    const urls = [...new Set(index.entries.filter((e) => e.k === "page").map((e) => e.u))];
    expect(urls.length).toBeGreaterThan(10);
    const overflowing: string[] = [];
    for (const url of urls) {
      // Index URLs are site routes without the base path or trailing slash.
      await page.goto(p(`${url}/`), { waitUntil: "domcontentloaded" });
      const { scroll, client } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      if (scroll > client) overflowing.push(`${url} (${scroll}px > ${client}px)`);
    }
    expect(overflowing).toEqual([]);
  });
});
