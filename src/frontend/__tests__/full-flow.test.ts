import { expect, test, Request } from '@playwright/test';
import { RestError } from "@azure/core-rest-pipeline";

test.beforeEach(async ({ page }) => {
  async function delay(milliseconds: number) {
    await new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  let lastRequestTime = new Date().getTime();

  const errors = new Array<string>();

  function onRequestActivity(request: Request) {
    lastRequestTime = new Date().getTime();
  }

  async function onError(errorOrRequest: RestError | Error | Request) {
    if (!("url" in errorOrRequest)) {
      errors.push(errorOrRequest.message + ": " + errorOrRequest.stack);
      return;
    }

    const response = await errorOrRequest.response();
    const errorMessage = errorOrRequest.failure()?.errorText || "(no message)";
    errors.push("[REQUEST] " + errorOrRequest.method() + " " + errorOrRequest.url() + " (" + response?.status() + ")" + ": " + errorMessage);
  }

  page.on("pageerror", onError);
  page.on("request", onRequestActivity);
  page.on("requestfailed", request => {
    onRequestActivity(request);
    onError(request);
  });
  page.on("requestfinished", request => {
    onRequestActivity(request);

    if (request.failure())
      onError(request);
  });

  await page.goto('/');

  const startTime = new Date().getTime();
  while (new Date().getTime() - startTime < 3 * 60 * 1000) {
    await page.reload();

    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await page.waitForLoadState("networkidle");

    lastRequestTime = new Date().getTime();

    while (new Date().getTime() - lastRequestTime < 3 * 1000) {
      await delay(100);
    }

    if (errors.length > 0) {
      console.warn("Errors encountered so far: " + errors.join("\n"));
      errors.splice(0);
      continue;
    }

    console.log("Initialized!");
    return;
  }

  throw new Error("Did not initialize page in time: " + errors.join("\n"));
});

test('full flow', async ({ page }) => {
  await page.goto('/');
  const text = await page.textContent('h1');
  expect(text).toBe('Welcome to Next.js!');
});