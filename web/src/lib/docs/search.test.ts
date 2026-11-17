import { describe, expect, it } from "vitest";
import { type SearchEntry, prepare, search, snippet, tokenize } from "./search-core";
import { buildSearchIndex } from "./search-index";
import { loadDocsSite } from "./site";
import { makeWeb, page, section } from "./test-fixtures";

describe("tokenize", () => {
  it("lowercases and splits identifiers", () => {
    expect(tokenize("getFinancialContribution() & SPONSORKIT_MOCK")).toEqual([
      "getfinancialcontribution",
      "get",
      "financial",
      "contribution",
      "sponsorkit_mock",
      "sponsorkit",
      "mock",
    ]);
    expect(tokenize("HTTPClient")).toEqual(["httpclient", "http", "client"]);
  });
});

const e = (t: string, x = "", k: SearchEntry["k"] = "section", p = "Page"): SearchEntry => ({ u: `/docs/${t}`, t, p, c: p, x, k });

describe("search", () => {
  const index = prepare([
    e("Checkout", "Send supporters to the provider.", "page", "Checkout"),
    e("Choosing a provider", "Currency must match exactly.", "section", "Checkout"),
    e("Mock mode", "Mock presets for tests: active-monthly.", "page", "Mock mode"),
    e("getFinancialContribution", "Returns the contributions.", "section", "Sponsorkit"),
  ]);
  it("requires every term (prefix match) and ranks titles first", () => {
    expect(search(index, "checkout").map((r) => r.t)).toEqual(["Checkout", "Choosing a provider"]);
    expect(search(index, "curr match").map((r) => r.t)).toEqual(["Choosing a provider"]);
    expect(search(index, "mock pres").map((r) => r.t)).toEqual(["Mock mode"]);
    expect(search(index, "nothing here")).toEqual([]);
    expect(search(index, "  ")).toEqual([]);
  });
  it("finds identifiers by their parts", () => {
    expect(search(index, "financial").map((r) => r.t)).toEqual(["getFinancialContribution"]);
    expect(search(index, "getfinancialcontribution").map((r) => r.t)).toEqual(["getFinancialContribution"]);
  });
  it("ranks hand-written guides above same-named API reference symbols", () => {
    const g = (u: string, t: string, x: string, k: SearchEntry["k"] = "page"): SearchEntry => ({ u, t, p: t, c: `Guides › ${t}`, x, k });
    const ref = (u: string, t: string, p: string): SearchEntry => ({ u, t, p, c: `API reference › ${p}`, x: `${t} member.`, k: "section", r: 1 });
    const refs: SearchEntry[] = [];
    for (const lang of ["js", "dotnet", "python", "go", "rust"]) {
      refs.push({ u: `/docs/reference/${lang}/nag`, t: "Nag", p: "Nag", c: "API reference › Nag", x: "Nag helper.", k: "page", r: 1 });
      refs.push({ u: `/docs/reference/${lang}/mock`, t: "Mock", p: "Mock", c: "API reference › Mock", x: "Mock presets.", k: "page", r: 1 });
      refs.push(ref(`/docs/reference/${lang}/contributionresult#mock`, "mock", "ContributionResult"));
      refs.push(ref(`/docs/reference/${lang}/sponsorkit#checkout`, "checkout", "Sponsorkit"));
      refs.push(ref(`/docs/reference/${lang}/sponsorkit#opencheckout`, "openCheckout", "Sponsorkit"));
    }
    const idx = prepare([
      ...refs,
      g("/docs/guides/nag", "Show a sponsor nag in a CLI", "Print a polite message every N runs."),
      g("/docs/guides/mock-mode", "Test your integration", "Test your rules with mock presets and keep CI quiet."),
      g("/docs/guides/checkout", "Open checkout and detect a new contribution", "Send supporters to GitHub Sponsors."),
      g("/docs/guides/checkout#choosing-a-provider", "Choosing a provider", "Checkout needs a provider.", "section"),
    ]);
    const top3 = (q: string) => search(idx, q, 3).map((r) => r.u);
    expect(top3("nag")).toContain("/docs/guides/nag");
    expect(top3("mock")).toContain("/docs/guides/mock-mode");
    expect(top3("mock mode")).toContain("/docs/guides/mock-mode");
    expect(top3("checkout")).toContain("/docs/guides/checkout");
    expect(search(idx, "nag", 1)[0]!.u).toBe("/docs/guides/nag");
    // Reference symbols are still found by name.
    expect(top3("opencheckout")[0]).toMatch(/^\/docs\/reference\/.+#opencheckout$/);
  });
  it("makes snippets around the match", () => {
    const text = `${"a ".repeat(100)}needle ${"b ".repeat(100)}`;
    const s = snippet(text, "needle", 60);
    expect(s).toContain("needle");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("buildSearchIndex", () => {
  it("indexes pages and h2/h3 sections, including the generated reference", () => {
    const web = makeWeb({
      "content/docs/guides/_section.md": section("Guides", 10),
      "content/docs/guides/checkout.md": page("Checkout", "", "Intro.\n\n## Choosing a provider\n\nCurrency.\n\n### Tiers {#tiers}\n\nCheapest."),
      ".generated/reference/js/_meta.json": '{"lang":"js","generator":"t"}',
      ".generated/reference/js/index.md": page("JS API", "kind: index\nsymbol: sponsorkit\n", "## signIn {#signin}\n\nSigns in."),
    });
    const index = buildSearchIndex(loadDocsSite({ webDir: web, strict: false }));
    const byUrl = new Map(index.entries.map((x) => [x.u, x]));
    expect(byUrl.get("/docs/guides/checkout")).toMatchObject({ t: "Checkout", k: "page", c: "Guides › Checkout", x: "About Checkout. Intro." });
    expect(byUrl.get("/docs/guides/checkout#choosing-a-provider")).toMatchObject({ t: "Choosing a provider", p: "Checkout", x: "Currency." });
    expect(byUrl.get("/docs/guides/checkout#tiers")).toMatchObject({ t: "Tiers" });
    expect(byUrl.get("/docs/reference/js#signin")).toMatchObject({ t: "signIn", r: 1, c: "API reference › JavaScript / TypeScript › JS API" });
    expect(byUrl.get("/docs/reference/js")!.x).toContain("sponsorkit");
    // Placeholders for missing languages are indexed too.
    expect(byUrl.has("/docs/reference/rust")).toBe(true);
  });
});
