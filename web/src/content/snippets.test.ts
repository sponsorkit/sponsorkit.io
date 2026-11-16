import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { languages, selfHostSnippet } from "./snippets";

const here = path.dirname(fileURLToPath(import.meta.url));
const code = (id: (typeof languages)[number]["id"]) => languages.find((l) => l.id === id)!.code;

describe("self-hosting snippet", () => {
  it("sets every secret the Worker needs", () => {
    const example = readFileSync(path.join(here, "../../../app/.dev.vars.example"), "utf8");
    const secrets = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
    expect(secrets).toContain("GITHUB_METADATA_TOKEN");
    for (const name of secrets) expect(selfHostSnippet).toContain(`wrangler secret put ${name}`);
  });
  it("runs wrangler from app/, where wrangler.jsonc lives", () => {
    const cd = selfHostSnippet.indexOf("cd app");
    expect(cd).toBeGreaterThanOrEqual(0);
    expect(selfHostSnippet.indexOf("wrangler ")).toBeGreaterThan(cd);
  });
});

// Guards against quickstarts drifting from the SDK signatures (they must compile when copied).
describe("language quickstarts", () => {
  it("JS: appName and native sign-in come from the node entry", () => {
    expect(code("js")).toContain(`from "@sponsorkit/sdk/node"`);
  });
  it(".NET: options objects, not positional tokens or named frequency", () => {
    const c = code("dotnet");
    expect(c).not.toMatch(/SignInAsync\(cancellationToken\)/);
    expect(c).toContain("new CheckoutUrlOptions { Frequency = Frequencies.Monthly }");
  });
  it("Go: two-value returns are destructured", () => {
    const c = code("go");
    expect(c).toContain("fc, _ := sk.GetFinancialContribution(ctx)");
    expect(c).toMatch(/_, err := sk\.SignIn\(ctx\)/);
    expect(c).toContain("link, _ := sk.CheckoutURL(");
  });
  it("Rust: options arguments and Results are handled", () => {
    const c = code("rust");
    expect(c).toContain("get_financial_contribution(GetOptions::default()).await?");
    expect(c).toContain("sign_in(SignInOptions::default()).await?");
    expect(c).toContain("checkout_url(&CheckoutOptions::default())?");
  });
});
