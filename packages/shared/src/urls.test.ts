import { describe, expect, test } from "bun:test";
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_SITE_BASE_URL,
  DEFAULT_SITE_ORIGIN,
  problemTypeUrl,
  resolveBaseUrls,
  SITE_PATHS,
  siteOrigin,
  siteUrl,
} from "./urls";

describe("resolveBaseUrls", () => {
  test("defaults to the split deployment", () => {
    expect(resolveBaseUrls()).toEqual({ apiBaseUrl: DEFAULT_API_BASE_URL, siteBaseUrl: DEFAULT_SITE_BASE_URL });
  });

  test("apiBaseUrl alone also sets the site (single origin)", () => {
    expect(resolveBaseUrls({ apiBaseUrl: "http://127.0.0.1:4000/" })).toEqual({
      apiBaseUrl: "http://127.0.0.1:4000",
      siteBaseUrl: "http://127.0.0.1:4000",
    });
  });

  test("siteBaseUrl alone keeps the default API", () => {
    expect(resolveBaseUrls({ siteBaseUrl: "https://example.com/sk/" })).toEqual({
      apiBaseUrl: DEFAULT_API_BASE_URL,
      siteBaseUrl: "https://example.com/sk",
    });
  });

  test("both set; empty strings count as unset", () => {
    expect(resolveBaseUrls({ apiBaseUrl: "https://api.x.dev", siteBaseUrl: "https://x.dev" })).toEqual({
      apiBaseUrl: "https://api.x.dev",
      siteBaseUrl: "https://x.dev",
    });
    expect(resolveBaseUrls({ apiBaseUrl: "", siteBaseUrl: "" })).toEqual(resolveBaseUrls());
  });
});

describe("site URLs", () => {
  test("site origin drops the base path", () => {
    expect(siteOrigin(DEFAULT_SITE_BASE_URL)).toBe(DEFAULT_SITE_ORIGIN);
  });

  test("pages use the trailing-slash form", () => {
    expect(siteUrl(DEFAULT_SITE_BASE_URL, SITE_PATHS.connect, new URLSearchParams({ targets: "github:a" }))).toBe(
      "https://sponsorkit.github.io/sponsorkit.io/connect/?targets=github%3Aa",
    );
    expect(siteUrl("https://x.dev/", SITE_PATHS.checkoutThanks)).toBe("https://x.dev/checkout/thanks/");
  });

  test("problem type points at the site's API error docs", () => {
    expect(problemTypeUrl()).toBe("https://sponsorkit.github.io/sponsorkit.io/docs/reference-http/http-api/#errors");
  });
});
