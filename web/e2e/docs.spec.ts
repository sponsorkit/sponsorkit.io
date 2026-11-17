import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { parse as parseYaml } from "yaml";

test.describe("docs navigation", () => {
  test("sidebar, breadcrumbs, TOC, prev/next and edit link", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sponsorkit documentation");
    const sidebar = page.getByRole("navigation", { name: "Documentation" });
    await sidebar.getByRole("link", { name: "Quickstart" }).click();
    await expect(page).toHaveURL(/\/docs\/getting-started\/quickstart$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quickstart");
    await expect(sidebar.getByRole("link", { name: "Quickstart" })).toHaveAttribute("aria-current", "page");

    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.getByRole("link")).toHaveText(["Docs", "Getting started"]);

    const toc = page.getByRole("navigation", { name: "On this page" });
    await expect(toc.getByRole("link", { name: "Install" })).toHaveAttribute("href", "#install");
    await expect(page.locator("h2#install a.anchor")).toHaveAttribute("href", "#install");

    await expect(page.getByRole("link", { name: "Edit this page on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/sponsorkit/sponsorkit.io/edit/main/web/content/docs/getting-started/quickstart.md",
    );
    const pager = page.getByRole("navigation", { name: "Previous and next pages" });
    await expect(pager.getByRole("link", { name: /Previous/ })).toHaveAttribute("href", "/docs/getting-started");
    await pager.getByRole("link", { name: /Next/ }).click();
    await expect(page).toHaveURL(/\/docs\/install$/);
  });

  test("landmarks and skip link", async ({ page }) => {
    await page.goto("/docs/concepts/targets");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("main")).toContainText("A target is an account");
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
  });

  test("unknown docs pages are 404s with a docs hint", async ({ page }) => {
    const res = await page.goto("/docs/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
    await expect(page.getByTestId("docs-404-hint")).toBeVisible();
  });
});

test.describe("tabs", () => {
  test("sync on the page and persist across pages and reloads", async ({ page }) => {
    await page.goto("/docs/getting-started/quickstart");
    const lists = page.getByRole("tablist");
    await expect(lists).toHaveCount(2);
    await expect(lists.nth(1).getByRole("tab", { name: "JavaScript" })).toHaveAttribute("aria-selected", "true");
    await lists.first().getByRole("tab", { name: "Python" }).click();
    for (const i of [0, 1]) await expect(lists.nth(i).getByRole("tab", { name: "Python" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel").filter({ hasText: "sk.get_financial_contribution()" })).toBeVisible();
    await expect(page.getByText("npm install @sponsorkit/sdk")).toBeHidden();

    // The install page may hold several tab sets; they all follow the remembered language.
    await page.goto("/docs/install");
    const install = page.getByRole("tablist").first();
    await expect(install.getByRole("tab", { name: "Python" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("pip install sponsorkit").first()).toBeVisible();
    await page.reload();
    await expect(install.getByRole("tab", { name: "Python" })).toHaveAttribute("aria-selected", "true");

    // Keyboard: arrows move between tabs.
    await install.getByRole("tab", { name: "Python" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(install.getByRole("tab", { name: "Go" })).toBeFocused();
    await expect(install.getByRole("tab", { name: "Go" })).toHaveAttribute("aria-selected", "true");
  });

  test("still work when storage is blocked", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/docs/getting-started/quickstart");
    await page.getByRole("tablist").first().getByRole("tab", { name: "Rust" }).click();
    await expect(page.getByRole("tablist").nth(1).getByRole("tab", { name: "Rust" })).toHaveAttribute("aria-selected", "true");
    expect(errors).toEqual([]);
  });
});

test.describe("code blocks", () => {
  test("copy button copies the code", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/docs/install");
    const block = page.getByRole("tabpanel").locator("figure.code").filter({ hasText: "npm install @sponsorkit/sdk" }).first();
    await block.getByRole("button", { name: /Copy/ }).click();
    await expect(block.getByRole("button", { name: /Copied/ })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npm install @sponsorkit/sdk");
  });
});

test.describe("search", () => {
  test('opens with "/" and navigates to a result', async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "Search the docs" });
    // The shortcut listener attaches on hydration, so retry the key press until it does.
    await expect(async () => {
      await page.keyboard.press("/");
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    await page.keyboard.type("error contract");
    const results = dialog.getByRole("option");
    await expect(results.first()).toContainText("Error contract");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/docs\/concepts\/error-contract$/);
    await expect(dialog).toBeHidden();
  });

  test("covers the API reference and section headings", async ({ page }) => {
    await page.goto("/docs");
    await page.getByRole("button", { name: /Search/ }).click();
    const input = page.getByRole("combobox", { name: "Search the docs" });
    await input.fill("rust api reference");
    await expect(page.getByRole("option").first()).toContainText("Rust API reference");
    await input.fill("choosing provider");
    await page.getByRole("option").first().click();
    await expect(page).toHaveURL(/\/docs\/guides\/checkout#choosing-a-provider$/);
  });

  test("typing / in a field doesn't open search", async ({ page }) => {
    await page.goto("/docs");
    await page.keyboard.press("/");
    const input = page.getByRole("combobox", { name: "Search the docs" });
    await input.fill("a/b");
    await expect(input).toHaveValue("a/b");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("theme", () => {
  test("toggle persists across pages", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/docs");
    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(14, 13, 20)");
  });
});

test.describe("mobile drawer", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("opens, closes with Escape, and closes on navigation", async ({ page }) => {
    await page.goto("/docs/concepts/targets");
    const sidebar = page.getByRole("navigation", { name: "Documentation" });
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    await expect(sidebar).toBeHidden();
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeHidden();
    await expect(menu).toBeFocused();

    await menu.click();
    await sidebar.getByRole("link", { name: "Error contract" }).click();
    await expect(page).toHaveURL(/\/docs\/concepts\/error-contract$/);
    await expect(sidebar).toBeHidden();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("API reference", () => {
  const generated = path.join(process.cwd(), ".generated", "reference");

  test("overview lists every language", async ({ page }) => {
    await page.goto("/docs/reference");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("API reference");
    for (const name of ["JavaScript / TypeScript", ".NET", "Python", "Go", "Rust"]) {
      await expect(page.getByRole("main").getByRole("link", { name, exact: true })).toBeVisible();
    }
  });

  for (const lang of ["js", "dotnet", "python", "go", "rust"]) {
    test(`${lang}: generated reference or placeholder`, async ({ page }) => {
      await page.goto(`/docs/reference/${lang}`);
      const main = page.getByRole("main");
      const index = path.join(generated, lang, "index.md");
      if (!existsSync(index)) {
        await expect(main.getByText("Not generated in this build")).toBeVisible();
        await expect(main.getByText(`bun run --cwd web docs:generate --only ${lang}`)).toBeVisible();
      } else {
        const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(index, "utf8"))![1]!;
        const title = String((parseYaml(fm) as { title: unknown }).title);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
        const meta = JSON.parse(readFileSync(path.join(generated, lang, "_meta.json"), "utf8")) as { stub?: boolean };
        await expect(main.getByText("produced by a stub generator")).toHaveCount(meta.stub ? 1 : 0);
      }
      const group = page.getByRole("navigation", { name: "Documentation" }).locator("details", { has: page.locator(`a[href="/docs/reference/${lang}"]`) });
      await expect(group.first()).toHaveAttribute("open", "");
    });
  }
});
