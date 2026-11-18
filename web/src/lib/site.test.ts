import { describe, expect, it } from "vitest";
import { siteConfig } from "../../site-config";
import { absoluteUrl, sitePath } from "./site";

describe("siteConfig (PROTOCOL §0.2)", () => {
  it("defaults to the GitHub Pages project site and the API domain", () => {
    expect(siteConfig({})).toEqual({
      basePath: "/sponsorkit.io",
      trailingSlash: true,
      siteUrl: "https://sponsorkit.github.io/sponsorkit.io",
      apiBase: "https://api.sponsorkit.io",
    });
  });
  it("lets the environment win; empty BASE_PATH and API base build for single-origin self-hosting", () => {
    expect(
      siteConfig({ BASE_PATH: "", TRAILING_SLASH: "0", SITE_URL: "https://sponsors.example.com/", NEXT_PUBLIC_SPONSORKIT_API_BASE: "" }),
    ).toEqual({ basePath: "", trailingSlash: false, siteUrl: "https://sponsors.example.com", apiBase: "" });
    expect(siteConfig({ BASE_PATH: "/docs-site/", NEXT_PUBLIC_SPONSORKIT_API_BASE: "http://127.0.0.1:8787/" })).toMatchObject({
      basePath: "/docs-site",
      siteUrl: "https://sponsorkit.github.io/docs-site",
      apiBase: "http://127.0.0.1:8787",
    });
    expect(siteConfig({ TRAILING_SLASH: "1" }).trailingSlash).toBe(true);
  });
  it("rejects a malformed base path", () => {
    expect(() => siteConfig({ BASE_PATH: "sponsorkit.io" })).toThrow(/BASE_PATH/);
    expect(() => siteConfig({ BASE_PATH: "/a b" })).toThrow(/BASE_PATH/);
  });
});

describe("site URLs", () => {
  it("builds base-path page paths and absolute trailing-slash URLs", () => {
    expect(sitePath("/checkout/", "/sponsorkit.io")).toBe("/sponsorkit.io/checkout/");
    expect(sitePath("/checkout/", "")).toBe("/checkout/");
    const site = "https://sponsorkit.github.io/sponsorkit.io";
    expect(absoluteUrl("/", site, true)).toBe(`${site}/`);
    expect(absoluteUrl("/docs/concepts/targets", site, true)).toBe(`${site}/docs/concepts/targets/`);
    expect(absoluteUrl("/docs", site, false)).toBe(`${site}/docs`);
  });
});
