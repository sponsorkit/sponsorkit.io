import { expect, test, type Page } from "@playwright/test";
import { API, CHALLENGE, mockApi, p, q } from "./fixtures";

/** The start form behind a provider button, as the browser would submit it. */
async function startForm(page: Page, provider: string) {
  return page.getByTestId(`start-form-${provider}`).evaluate((el) => {
    const f = el as HTMLFormElement;
    return {
      method: f.method,
      action: f.action,
      enctype: f.enctype,
      target: f.target,
      // Every input is hidden: the only visible control is the submit button.
      hiddenOnly: [...f.querySelectorAll("input")].every((i) => i.type === "hidden"),
      fields: [...f.querySelectorAll<HTMLInputElement>("input")].map((i) => [i.name, i.value] as [string, string]),
    };
  });
}

test.describe("/connect/ consent screen (PROTOCOL §4.2)", () => {
  test("renders targets, the requesting origin, consent text and provider buttons", async ({ page, context, baseURL }) => {
    const api = await mockApi(context);
    const params = {
      targets: "opencollective:sponsorkit,github:octocat",
      challenge: CHALLENGE,
      delivery: "web_message",
      origin: "https://app.example.com",
    };
    await page.goto(p(`/connect/?${q(params)}`));

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

    // One button per provider, each submitting a top-level form POST to <API>/api/oauth/<provider>/start
    // with the same params as hidden fields (PROTOCOL §4.2 step 3).
    await expect(page.getByTestId("continue-opencollective")).toBeVisible();
    const form = await startForm(page, "github");
    expect(form).toEqual({
      method: "post",
      action: `${API}/api/oauth/github/start`,
      enctype: "application/x-www-form-urlencoded",
      target: "_self",
      hiddenOnly: true,
      fields: [
        ["targets", "github:octocat,opencollective:sponsorkit"],
        ["challenge", CHALLENGE],
        ["delivery", "web_message"],
        ["origin", "https://app.example.com"],
      ],
    });
    await expect(page.locator("a[href*='/api/oauth/']")).toHaveCount(0);
    // strict-origin, so the cross-origin POST carries this site's real Origin (PROTOCOL §4.1).
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "strict-origin");

    await page.getByTestId("continue-github").click();
    await expect(page.getByRole("heading", { name: "OAuth start" })).toBeVisible();
    expect(page.url()).toBe(`${API}/api/oauth/github/start`);
    expect(api.oauth).toHaveLength(1);
    const start = api.oauth[0]!;
    expect(start.method).toBe("POST");
    expect(start.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(start.headers["origin"]).toBe(new URL(baseURL!).origin);
    // strict-origin: Referer is the origin only, never the page's path and query.
    expect(start.headers["referer"]).toBe(`${new URL(baseURL!).origin}/`);
    expect(Object.fromEntries(new URLSearchParams(start.body ?? ""))).toEqual({
      targets: "github:octocat,opencollective:sponsorkit",
      challenge: CHALLENGE,
      delivery: "web_message",
      origin: "https://app.example.com",
    });
  });

  test("labels a native app name as 'says it is' for loopback and paste", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(
      p(`/connect/?${q({ targets: "github:octocat", challenge: CHALLENGE, delivery: "loopback", redirect_uri: "http://127.0.0.1:53682/callback", app_name: "my-cli" })}`),
    );
    await expect(page.getByTestId("requester")).toHaveText("says it is “my-cli”");
    await expect(page.getByTestId("continue-opencollective")).toHaveCount(0);

    await page.goto(p(`/connect/?${q({ targets: "github:octocat", challenge: CHALLENGE, delivery: "paste" })}`));
    await expect(page.getByTestId("requester")).toContainText("didn’t give its name");
  });

  test("shows the return host for redirect delivery", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(
      p(`/connect/?${q({ targets: "github:octocat", challenge: CHALLENGE, delivery: "redirect", redirect_uri: "https://app.example.com/after" })}`),
    );
    await expect(page.getByTestId("requester")).toHaveText("app.example.com");
    await expect(page.getByText("You’ll return to app.example.com afterwards.")).toBeVisible();
  });

  test("provider param shows only that provider; add=1 changes the copy", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(
      p(`/connect/?${q({ targets: "github:octocat,opencollective:sponsorkit", challenge: CHALLENGE, delivery: "paste", provider: "opencollective", add: "1" })}`),
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connect another account");
    await expect(page.getByTestId("continue-github")).toHaveCount(0);
    const form = await startForm(page, "opencollective");
    expect(form.action).toBe(`${API}/api/oauth/opencollective/start`);
    expect(Object.fromEntries(form.fields)).toMatchObject({ add: "1", provider: "opencollective", delivery: "paste" });
  });

  test("shows an error for invalid params", async ({ page, context }) => {
    await mockApi(context);
    await page.goto(p(`/connect/?${q({ targets: "github:-nope", delivery: "web_message" })}`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link doesn’t work");
    await expect(page.getByTestId("errors").locator("li")).not.toHaveCount(0);
    await expect(page.locator("form[action*='/api/oauth/'], a[href*='/api/oauth/']")).toHaveCount(0);
  });

  test("still offers sign-in when target details can't be loaded", async ({ page, context }) => {
    await context.route(`${API}/api/v1/targets?*`, (r) => r.fulfill({ status: 503, headers: { "Access-Control-Allow-Origin": "*" }, body: "" }));
    await page.goto(p(`/connect/?${q({ targets: "github:octocat", challenge: CHALLENGE, delivery: "paste" })}`));
    await expect(page.getByRole("status")).toContainText("couldn’t be verified");
    await expect(page.getByTestId("target-github")).toContainText("@octocat");
    await expect(page.getByTestId("continue-github")).toBeVisible();
  });

  test("hides the provider buttons when framed and offers a top-level link instead (PROTOCOL §4.1)", async ({ page, context }) => {
    const api = await mockApi(context);
    const url = p(`/connect/?${q({ targets: "github:octocat", challenge: CHALLENGE, delivery: "paste" })}`);
    // A same-origin frame host keeps the test self-contained; a cross-origin host behaves the same.
    await page.goto(p("/"));
    await page.evaluate((src) => {
      const f = document.createElement("iframe");
      f.src = src;
      f.name = "consent";
      f.style.width = "600px";
      f.style.height = "600px";
      document.body.append(f);
    }, url);
    const frame = page.frameLocator('iframe[name="consent"]');
    await expect(frame.getByTestId("framed")).toBeVisible();
    await expect(frame.getByTestId("open-top-level")).toHaveAttribute("target", "_blank");
    expect(new URL((await frame.getByTestId("open-top-level").getAttribute("href"))!).pathname).toBe(p("/connect/"));
    await expect(frame.locator("form, [data-testid^='continue-']")).toHaveCount(0);
    expect(api.oauth).toEqual([]);
  });
});
