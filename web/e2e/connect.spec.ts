import { expect, test } from "@playwright/test";
import { CHALLENGE, mockApi, q } from "./fixtures";

test.describe("/connect consent screen (PROTOCOL §4.2)", () => {
  test("renders targets, the requesting origin, consent text and provider buttons", async ({ page, context }) => {
    const api = await mockApi(context);
    const params = {
      targets: "opencollective:sponsorkit,github:octocat",
      challenge: CHALLENGE,
      delivery: "web_message",
      origin: "https://app.example.com",
    };
    await page.goto(`/connect?${q(params)}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your sponsorship");
    await expect(page.getByTestId("requester")).toHaveText("https://app.example.com");

    const gh = page.getByTestId("target-github");
    await expect(gh).toContainText("The Octocat");
    await expect(gh).toContainText("@octocat");
    await expect(gh.locator("img")).toHaveAttribute("src", "https://avatars.githubusercontent.com/u/583231?v=4");
    await expect(page.getByTestId("target-opencollective")).toContainText("Sponsorkit Collective");

    await expect(page.getByTestId("consent-text")).toHaveText(
      "An app wants to know whether you sponsor @octocat on GitHub and Sponsorkit Collective on Open Collective. It will see the amount, frequency and status of those contributions only, including private ones. Nothing else about your account is shared, and Sponsorkit stores nothing.",
    );
    expect(api.targetQueries).toContain("?github=octocat&opencollective=sponsorkit");

    // One button per provider, pointing at /api/oauth/<provider>/start with the same params.
    const ghButton = page.getByTestId("continue-github");
    await expect(page.getByTestId("continue-opencollective")).toBeVisible();
    const href = await ghButton.getAttribute("href");
    const start = new URL(href!, page.url());
    expect(start.pathname).toBe("/api/oauth/github/start");
    expect(Object.fromEntries(start.searchParams)).toEqual({
      targets: "github:octocat,opencollective:sponsorkit",
      challenge: CHALLENGE,
      delivery: "web_message",
      origin: "https://app.example.com",
    });

    await ghButton.click();
    await expect(page).toHaveURL(/\/api\/oauth\/github\/start\?/);
    await expect(page.getByRole("heading", { name: "OAuth start" })).toBeVisible();
  });

  test("labels a native app name as 'says it is' for loopback and paste", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(
      `/connect?${q({ targets: "github:octocat", challenge: CHALLENGE, delivery: "loopback", redirect_uri: "http://127.0.0.1:53682/callback", app_name: "my-cli" })}`,
    );
    await expect(page.getByTestId("requester")).toHaveText("says it is “my-cli”");
    await expect(page.getByTestId("continue-opencollective")).toHaveCount(0);

    await page.goto(`/connect?${q({ targets: "github:octocat", challenge: CHALLENGE, delivery: "paste" })}`);
    await expect(page.getByTestId("requester")).toContainText("didn’t give its name");
  });

  test("shows the return host for redirect delivery", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(
      `/connect?${q({ targets: "github:octocat", challenge: CHALLENGE, delivery: "redirect", redirect_uri: "https://app.example.com/after" })}`,
    );
    await expect(page.getByTestId("requester")).toHaveText("app.example.com");
    await expect(page.getByText("You’ll return to app.example.com afterwards.")).toBeVisible();
  });

  test("provider param shows only that provider; add=1 changes the copy", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(
      `/connect?${q({ targets: "github:octocat,opencollective:sponsorkit", challenge: CHALLENGE, delivery: "paste", provider: "opencollective", add: "1" })}`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connect another account");
    await expect(page.getByTestId("continue-github")).toHaveCount(0);
    const href = await page.getByTestId("continue-opencollective").getAttribute("href");
    const sp = new URL(href!, page.url()).searchParams;
    expect(sp.get("add")).toBe("1");
    expect(sp.get("provider")).toBe("opencollective");
  });

  test("shows an error for invalid params", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(`/connect?${q({ targets: "github:-nope", delivery: "web_message" })}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link doesn’t work");
    await expect(page.getByTestId("errors").locator("li")).not.toHaveCount(0);
    await expect(page.locator("a[href*='/api/oauth/']")).toHaveCount(0);
  });

  test("still offers sign-in when target details can't be loaded", async ({ page, context }) => {
    await context.route("**/api/v1/targets?*", (r) => r.fulfill({ status: 503, body: "" }));
    await page.goto(`/connect?${q({ targets: "github:octocat", challenge: CHALLENGE, delivery: "paste" })}`);
    await expect(page.getByRole("status")).toContainText("couldn’t be verified");
    await expect(page.getByTestId("target-github")).toContainText("@octocat");
    await expect(page.getByTestId("continue-github")).toBeVisible();
  });
});
