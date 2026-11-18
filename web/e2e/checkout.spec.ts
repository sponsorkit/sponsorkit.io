import { expect, test } from "@playwright/test";
import { API, CHALLENGE, github, mockApi, opencollective, p, q } from "./fixtures";

const BOTH = "github:octocat,opencollective:sponsorkit";

test.describe("/checkout/ (PROTOCOL §4.6, §6)", () => {
  test("auto-redirects when exactly one provider is eligible", async ({ page, context, baseURL }) => {
    await mockApi(context);
    // GitHub has no yearly frequency → only Open Collective is eligible.
    await page.goto(p(`/checkout/?${q({ targets: BOTH, frequency: "yearly", amount: "1250" })}`));
    await page.waitForURL(/^https:\/\/opencollective\.com\//);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/sponsorkit/donate");
    expect(url.searchParams.get("amount")).toBe("12.5");
    expect(url.searchParams.get("interval")).toBe("year");
    // The site base URL (origin + base path) + /checkout/thanks/ (PROTOCOL §6).
    expect(url.searchParams.get("redirect")).toBe(`${baseURL!.replace(/\/+$/, "")}/checkout/thanks/`);
  });

  test("redirects to the GitHub tier for a single GitHub target", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(p(`/checkout/?${q({ targets: "github:octocat", amount: "700", frequency: "monthly" })}`));
    await page.waitForURL("https://github.com/sponsors/octocat/sponsorships?tier_id=102");
  });

  test("redirects to the preferred provider when it is eligible", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(p(`/checkout/?${q({ targets: BOTH, frequency: "monthly", provider: "opencollective" })}`));
    await page.waitForURL(/^https:\/\/opencollective\.com\/sponsorkit\/donate\?interval=month&redirect=/);
  });

  test("shows the chooser when both providers are eligible", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(p(`/checkout/?${q({ targets: BOTH, frequency: "monthly", amount: "500" })}`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choose how to contribute");
    await expect(page.getByTestId("choice-github")).toContainText("$5 a month · Coffee");
    await expect(page.getByTestId("choice-opencollective")).toContainText("€5 a month");
    await expect(page.getByTestId("go-github")).toHaveAttribute("href", "https://github.com/sponsors/octocat/sponsorships?tier_id=101");

    await page.getByTestId("go-opencollective").click();
    await page.waitForURL(/^https:\/\/opencollective\.com\/sponsorkit\/donate\?amount=5&interval=month/);
  });

  test("shows the chooser with reasons when nothing is eligible", async ({ page, context }) => {
    await mockApi(context, [github, { ...opencollective, exists: false }]);
    await page.goto(p(`/checkout/?${q({ targets: BOTH, currency: "GBP", frequency: "yearly" })}`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("No way to contribute with these options");
    await expect(page.getByTestId("reasons-github")).toContainText("doesn't support yearly contributions");
    await expect(page.getByTestId("reasons-github")).toContainText("Only accepts USD, not GBP.");
    await expect(page.getByTestId("reasons-opencollective")).toContainText("wasn't found on Open Collective");
    await expect(page.locator("[data-testid^='go-']")).toHaveCount(0);
  });

  test("explains when the requested provider isn't eligible", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(p(`/checkout/?${q({ targets: BOTH, frequency: "yearly", provider: "github" })}`));
    await expect(page.getByRole("status")).toContainText("GitHub Sponsors isn’t available");
    await expect(page.getByTestId("go-opencollective")).toBeVisible();
    await expect(page.getByTestId("reasons-github")).toBeVisible();
  });

  test("signs in first when a challenge is present, passing continue", async ({ page, context }) => {
    const api = await mockApi(context);
    const params = {
      targets: BOTH,
      challenge: CHALLENGE,
      delivery: "web_message",
      origin: "https://app.example.com",
      amount: "500",
      frequency: "monthly",
    };
    await page.goto(p(`/checkout/?${q(params)}`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in, then contribute");
    await expect(page.getByTestId("requester")).toHaveText("https://app.example.com");
    const form = page.getByTestId("start-form-github");
    await expect(form).toHaveAttribute("method", "post");
    await expect(form).toHaveAttribute("action", `${API}/api/oauth/github/start`);
    await page.getByTestId("continue-github").click();
    await expect(page.getByRole("heading", { name: "OAuth start" })).toBeVisible();
    expect(api.oauth.map((r) => r.method)).toEqual(["POST"]);
    const body = new URLSearchParams(api.oauth[0]!.body ?? "");
    expect(body.get("challenge")).toBe(CHALLENGE);
    expect(body.get("origin")).toBe("https://app.example.com");
    expect(Object.fromEntries(new URLSearchParams(body.get("continue")!))).toEqual({
      targets: BOTH,
      amount: "500",
      frequency: "monthly",
    });
  });

  test("skips sign-in on step=choose", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(p(`/checkout/?${q({ targets: "github:octocat", challenge: CHALLENGE, step: "choose" })}`));
    await page.waitForURL(/^https:\/\/github\.com\/sponsors\/octocat/);
  });

  test("posts checkout_redirected to the opener before redirecting", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(p("/"));
    const origin = new URL(page.url()).origin;
    await page.evaluate(() => {
      const w = window as unknown as { __msgs: unknown[] };
      w.__msgs = [];
      window.addEventListener("message", (e) => w.__msgs.push(e.data));
    });
    const popupPromise = context.waitForEvent("page");
    await page.evaluate(
      (o) => {
        window.open(`checkout/?targets=github:octocat&origin=${encodeURIComponent(o)}`, "checkout");
      },
      origin,
    );
    const popup = await popupPromise;
    await popup.waitForURL(/^https:\/\/github\.com\//);
    expect(await page.evaluate(() => (window as unknown as { __msgs: unknown[] }).__msgs)).toEqual([
      { type: "sponsorkit:checkout_redirected", provider: "github" },
    ]);
  });

  test("rejects malformed params", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(p(`/checkout/?${q({ targets: "github:octocat", amount: "5.00" })}`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link doesn’t work");
  });

  test("thanks page", async ({ page }) => {
    await page.goto(p("/checkout/thanks/?orderId=1"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thank you for your support");
  });
});
