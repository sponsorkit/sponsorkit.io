import { expect, test, type Page } from "@playwright/test";
import { CODE, mockApi, p } from "./fixtures";

type Received = { data: unknown; origin: string };

/** Opens a page on our origin that records every message it receives, acting as the SDK's window. */
async function openerPage(page: Page): Promise<void> {
  await page.goto(p("/"));
  await page.evaluate(() => {
    const w = window as unknown as { __msgs: Received[] };
    w.__msgs = [];
    window.addEventListener("message", (e) => w.__msgs.push({ data: e.data, origin: e.origin }));
  });
}

async function messages(page: Page): Promise<Received[]> {
  return page.evaluate(() => (window as unknown as { __msgs: Received[] }).__msgs);
}

test.describe("/connect/done/ (PROTOCOL §4.5)", () => {
  test("posts the code to the opener with the given origin, then closes", async ({ page, context }) => {
    await openerPage(page);
    const origin = new URL(page.url()).origin;
    const popupPromise = context.waitForEvent("page");
    await page.evaluate(
      ({ o, code }) => {
        window.open(`connect/done/#code=${encodeURIComponent(code)}&origin=${encodeURIComponent(o)}`, "sk");
      },
      { o: origin, code: CODE },
    );
    const done = await popupPromise;
    await expect.poll(() => messages(page)).toEqual([{ data: { type: "sponsorkit:code", code: CODE }, origin }]);
    // It closes itself after ~300 ms.
    await done.waitForEvent("close", { timeout: 5000 });
  });

  test("never delivers the code to a different origin", async ({ page, context }) => {
    await openerPage(page);
    const popupPromise = context.waitForEvent("page");
    await page.evaluate((code) => {
      window.open(`connect/done/#code=${encodeURIComponent(code)}&origin=${encodeURIComponent("https://evil.example")}`, "sk");
    }, CODE);
    const done = await popupPromise;
    await done.waitForEvent("close", { timeout: 5000 });
    // postMessage was targeted at https://evil.example, so the browser dropped it.
    expect(await messages(page)).toEqual([]);
  });

  test("strips the fragment and explains when there is no opener", async ({ page }) => {
    await page.goto(p(`/connect/done/#code=${CODE}&origin=${encodeURIComponent("https://app.example.com")}`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This window lost track of the app");
    expect(new URL(page.url()).hash).toBe("");
    expect(page.url()).not.toContain(CODE);
  });

  test("with continue, posts the code and moves on to /checkout/?<continue>&step=choose", async ({ page, context }) => {
    await mockApi(context);
    await openerPage(page);
    const origin = new URL(page.url()).origin;
    const cont = "targets=github:octocat&amount=500&frequency=monthly";
    const popupPromise = context.waitForEvent("page");
    await page.evaluate(
      ({ o, code, c }) => {
        window.open(`connect/done/#code=${encodeURIComponent(code)}&origin=${encodeURIComponent(o)}&continue=${encodeURIComponent(c)}`, "sk");
      },
      { o: origin, code: CODE, c: cont },
    );
    const popup = await popupPromise;
    await expect.poll(() => messages(page)).toEqual([{ data: { type: "sponsorkit:code", code: CODE }, origin }]);
    // Single eligible provider → straight to GitHub's tier (mocked).
    await popup.waitForURL("https://github.com/sponsors/octocat/sponsorships?tier_id=101");
  });

  test("paste: shows the code with a copy button and strips the hash", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are Chromium-specific");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(p(`/connect/done/#paste=${CODE}`));
    await expect(page.getByTestId("paste-code")).toHaveText(CODE);
    await expect(page.getByText("Paste this into the app (valid for 10 minutes)")).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    await expect(page.getByTestId("continue-checkout")).toHaveCount(0);

    await page.getByTestId("copy-code").click();
    await expect(page.getByTestId("copy-code")).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(CODE);
  });

  test("paste with continue offers Continue to checkout", async ({ page }) => {
    await page.goto(p(`/connect/done/#paste=${CODE}&continue=${encodeURIComponent("targets=opencollective:sponsorkit&amount=500")}`));
    await expect(page.getByTestId("continue-checkout")).toHaveAttribute(
      "href",
      p("/checkout/?targets=opencollective%3Asponsorkit&amount=500&step=choose"),
    );
  });

  test("error: posts the error to the opener and shows a message", async ({ page, context }) => {
    await openerPage(page);
    const origin = new URL(page.url()).origin;
    const popupPromise = context.waitForEvent("page");
    await page.evaluate((o) => {
      window.open(`connect/done/#error=access_denied&origin=${encodeURIComponent(o)}`, "sk");
    }, origin);
    const popup = await popupPromise;
    await expect(popup.getByRole("heading", { level: 1 })).toHaveText("Sign-in cancelled");
    expect(new URL(popup.url()).hash).toBe("");
    await expect.poll(() => messages(page)).toEqual([{ data: { type: "sponsorkit:error", error: "access_denied" }, origin }]);
  });

  test("error without opener still shows a message", async ({ page }) => {
    await page.goto(p("/connect/done/#error=invalid_state"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This sign-in link expired");
  });
});
