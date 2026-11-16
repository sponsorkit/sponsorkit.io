import type { BrowserContext, Route } from "@playwright/test";
import type { TargetInfo, TargetsResponse } from "@sponsorkit/shared";

export const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
export const CODE = "skc_AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8";

// 1x1 transparent PNG so avatar <img>s load without hitting the network.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

export const github: TargetInfo = {
  target: "github:octocat",
  provider: "github",
  account: "octocat",
  exists: true,
  displayName: "The Octocat",
  avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4",
  url: "https://github.com/sponsors/octocat",
  currency: "USD",
  frequencies: ["monthly", "one_time"],
  customAmount: false,
  // `url` is built by the Worker from the decoded databaseId (PROTOCOL §6); clients never build it.
  tiers: [
    { id: "101", name: "Coffee", amount: { value: 500, currency: "USD" }, frequency: "monthly", url: "https://github.com/sponsors/octocat/sponsorships?tier_id=101" },
    { id: "102", name: "Lunch", amount: { value: 2500, currency: "USD" }, frequency: "monthly", url: "https://github.com/sponsors/octocat/sponsorships?tier_id=102" },
    { id: "201", name: "Thanks", amount: { value: 1000, currency: "USD" }, frequency: "one_time", url: "https://github.com/sponsors/octocat/sponsorships?tier_id=201" },
  ],
};

export const opencollective: TargetInfo = {
  target: "opencollective:sponsorkit",
  provider: "opencollective",
  account: "sponsorkit",
  exists: true,
  displayName: "Sponsorkit Collective",
  avatarUrl: "https://images.opencollective.com/sponsorkit/logo.png",
  url: "https://opencollective.com/sponsorkit",
  currency: "EUR",
  frequencies: ["one_time", "monthly", "yearly"],
  customAmount: true,
  tiers: [],
};

export interface ApiMock {
  /** Every /api/v1/targets query string seen. */
  targetQueries: string[];
}

/**
 * Mocks `/api/v1/*`, provider avatars, `/api/oauth/*` and the external provider checkout pages
 * for the whole context (so popups are covered too).
 */
export async function mockApi(context: BrowserContext, infos: TargetInfo[] = [github, opencollective]): Promise<ApiMock> {
  const mock: ApiMock = { targetQueries: [] };
  await context.route("**/api/v1/targets?*", async (route: Route) => {
    const url = new URL(route.request().url());
    mock.targetQueries.push(url.search);
    const wanted = new Set<string>();
    for (const [k, v] of url.searchParams) wanted.add(`${k}:${v}`);
    const body: TargetsResponse = { targets: infos.filter((i) => wanted.has(i.target)) };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await context.route("**/api/oauth/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>oauth start</title><h1>OAuth start</h1>" }),
  );
  await context.route(/^https:\/\/(avatars\.githubusercontent\.com|images\.opencollective\.com)\//, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG }),
  );
  await context.route(/^https:\/\/(github\.com|opencollective\.com)\//, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>provider</title><h1>Provider checkout</h1>" }),
  );
  return mock;
}

export function q(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}
