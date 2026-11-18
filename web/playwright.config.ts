import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4173);
// The export is served under its base path, like GitHub Pages (web/site-config.ts). Keep in sync
// with the build: `BASE_PATH= bun run build` needs `BASE_PATH=` here too.
const BASE_PATH = (process.env.BASE_PATH ?? "/sponsorkit.io").replace(/\/+$/, "");
// Use the pre-installed Chromium when present (CI images / sandboxes); otherwise Playwright's own.
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const executablePath = existsSync(CHROMIUM) ? CHROMIUM : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    // Trailing slash: tests navigate with relative paths ("connect/?…"), which resolve under the base path.
    baseURL: `http://127.0.0.1:${PORT}${BASE_PATH}/`,
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(executablePath && { launchOptions: { executablePath } }) },
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 }, ...(executablePath && { launchOptions: { executablePath } }) },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
  webServer: {
    // Serves the static export (run `bun run build` first; `test:e2e` does).
    command: `node scripts/serve.mjs --port ${PORT} --base "${BASE_PATH}"`,
    url: `http://127.0.0.1:${PORT}${BASE_PATH}/`,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
  },
});
