import { expect, test } from "@playwright/test";

test.describe("static pages", () => {
  test("landing page", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.hostname !== "127.0.0.1") external.push(r.url());
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sponsorships, built into your software.");
    for (const name of ["A three-line quickstart", "How it works", "Providers", "Nothing stored. Nothing to leak.", "Questions"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    // Highlighted at build time.
    await expect(page.locator("pre.shiki").first()).toBeVisible();
    // No trackers or third-party requests.
    expect(external).toEqual([]);
  });

  test("skip link is the first focusable element", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });

  test("docs cover every language and concept", async ({ page }) => {
    const cases: [string, string | RegExp][] = [
      ["/docs/getting-started/quickstart", "Quickstart"],
      ["/docs/concepts/targets", "Targets"],
      ["/docs/concepts/sessions", "Sign-in & sessions"],
      ["/docs/concepts/contributions", "Contribution shape"],
      ["/docs/concepts/statuses", "Statuses"],
      ["/docs/concepts/organizations", "Organization sponsorships"],
      ["/docs/concepts/caching", "Caching & freshness"],
      ["/docs/concepts/error-contract", "Error contract"],
      ["/docs/guides/checkout", "Open checkout and detect a new contribution"],
      ["/docs/guides/nag", "Show a sponsor nag in a CLI"],
      ["/docs/guides/mock-mode", "Test your integration"],
      ["/docs/guides/backend-verification", "Verify supporters on your backend"],
      ["/docs/reference-http/self-hosting", "Self-hosting"],
      ["/docs/reference-http", "HTTP API & protocol"],
      ...["js", "dotnet", "python", "go", "rust"].map((l): [string, RegExp] => [`/docs/languages/${l}`, /^Sponsorkit for /]),
    ];
    for (const [url, h1] of cases) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
    }
    await page.goto("/docs/install/supported-platforms");
    await expect(page.getByText("GetFinancialContributionAsync(ct)").first()).toBeVisible();
    await page.goto("/docs/reference-http/protocol");
    await expect(page.getByRole("main").getByRole("link", { name: "wire protocol", exact: true }).first()).toHaveAttribute("href", /PROTOCOL\.md$/);
  });

  test("landing page links into the docs", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Get started" }).click();
    await expect(page).toHaveURL(/\/docs\/getting-started$/);
    await page.goto("/");
    await page.getByRole("link", { name: "Rust", exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/languages\/rust$/);
  });

  test("unknown paths render the 404 page", async ({ page }) => {
    const res = await page.goto("/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
  });
});
