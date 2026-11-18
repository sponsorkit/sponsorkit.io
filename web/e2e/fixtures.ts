import type { BrowserContext, Route } from "@playwright/test";
import type { TargetInfo, TargetsResponse } from "@sponsorkit/shared";

/** Base path the export is served under (see playwright.config.ts). */
export const BASE_PATH = (process.env.BASE_PATH ?? "/sponsorkit.io").replace(/\/+$/, "");
/** API origin the build calls (NEXT_PUBLIC_SPONSORKIT_API_BASE, default https://api.sponsorkit.io). */
export const API = (process.env.NEXT_PUBLIC_SPONSORKIT_API_BASE ?? "https://api.sponsorkit.io").replace(/\/+$/, "");

/** Root-relative URL of a site path under the base path: `p("/connect/?…")` → `/sponsorkit.io/connect/?…`. */
export function p(path: string): string {
  return `${BASE_PATH}${path}`;
}

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

/** A request the page sent to `/api/oauth/*`. */
export interface OAuthRequest {
  method: string;
  url: string;
  /** Request body (form-encoded for a start), or null. */
  body: string | null;
  headers: Record<string, string>;
}

export interface ApiMock {
  /** Every /api/v1/targets query string seen. */
  targetQueries: string[];
  /** Every request to /api/oauth/* (sign-in starts). */
  oauth: OAuthRequest[];
}

/**
 * Mocks the API origin (`/api/v1/*` with CORS, `/api/oauth/*`), provider avatars and the external
 * provider checkout pages for the whole context (so popups are covered too).
 */
export async function mockApi(context: BrowserContext, infos: TargetInfo[] = [github, opencollective]): Promise<ApiMock> {
  const mock: ApiMock = { targetQueries: [], oauth: [] };
  await context.route(`${API}/api/v1/targets?*`, async (route: Route) => {
    const url = new URL(route.request().url());
    mock.targetQueries.push(url.search);
    const wanted = new Set<string>();
    for (const [k, v] of url.searchParams) wanted.add(`${k}:${v}`);
    const body: TargetsResponse = { targets: infos.filter((i) => wanted.has(i.target)) };
    // Cross-origin fetch from the site: the API answers with CORS `*` (PROTOCOL §3).
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(body),
    });
  });
  await context.route(`${API}/api/oauth/**`, async (route) => {
    const req = route.request();
    mock.oauth.push({ method: req.method(), url: req.url(), body: req.postData(), headers: await req.allHeaders() });
    await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>oauth start</title><h1>OAuth start</h1>" });
  });
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
