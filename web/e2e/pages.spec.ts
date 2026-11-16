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
    await page.goto("/docs");
    for (const id of [
      "quickstart-js",
      "quickstart-dotnet",
      "quickstart-python",
      "quickstart-go",
      "quickstart-rust",
      "targets",
      "sessions",
      "contributions",
      "statuses",
      "organizations",
      "caching",
      "checkout",
      "nag",
      "mock-mode",
      "backend-verification",
      "error-contract",
      "self-hosting",
      "protocol",
    ]) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    await expect(page.getByText("GetFinancialContributionAsync(ct)").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "normative wire protocol" })).toHaveAttribute("href", /PROTOCOL\.md$/);
  });

  test("unknown paths render the 404 page", async ({ page }) => {
    const res = await page.goto("/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
  });
});
