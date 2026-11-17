import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateReference } from "./validate-reference";
import { makeWeb, page, writeTree } from "./test-fixtures";

function setup(files: Record<string, string>) {
  const web = makeWeb({
    "content/docs/concepts/_section.md": "---\ntitle: Concepts\norder: 1\n---\n",
    "content/docs/concepts/targets.md": page("Targets", "", "## Target sets\n\nText."),
  });
  const out = path.join(path.dirname(web), "out-js");
  writeTree(out, files);
  return { web, out };
}

const good = {
  "_meta.json": JSON.stringify({ lang: "js", package: "@sponsorkit/sdk", generator: "test" }),
  "index.md": page("JavaScript API reference", "kind: index\n", "- [Sponsorkit](sponsorkit.md)\n- [Targets](/docs/concepts/targets#target-sets)"),
  "sponsorkit.md": page("Sponsorkit", "kind: class\nsymbol: Sponsorkit\n", "## Methods\n\n### signIn() {#signin}\n\nReturns a [result](types/result.md#fields)."),
  "types/result.md": page("ContributionResult", "kind: interface\n", "## Fields {#fields}\n\nBack to [signIn](../sponsorkit.md#signin)."),
};

describe("validateReference", () => {
  it("accepts output that follows the contract", async () => {
    const { web, out } = setup(good);
    const r = await validateReference("js", out, { webDir: web });
    expect(r.errors).toEqual([]);
    expect(r.pages).toBe(3);
    expect(r.stub).toBe(false);
  });

  it("reports contract violations", async () => {
    const { web, out } = setup({
      ...good,
      "_meta.json": JSON.stringify({ lang: "go", generator: "" }),
    });
    const r = await validateReference("js", out, { webDir: web });
    expect(r.errors).toEqual(['_meta.json: "lang" must be "js"', '_meta.json: "generator" must be a non-empty string']);
  });

  it("reports broken links, missing anchors, empty pages and bad frontmatter", async () => {
    const { web, out } = setup({
      ...good,
      "sponsorkit.md": page("Sponsorkit", "kind: klass\n", "See [x](missing.md), [y](types/result.md#nope) and [z](/docs/concepts/targets#nope)."),
      "empty.md": page("Empty", "", ""),
      "Bad.md": page("Bad"),
      "h1.md": page("H1", "", "# Title\n\nx"),
    });
    const r = await validateReference("js", out, { webDir: web });
    const rel = path.relative(path.dirname(web), out);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Bad.md: page file names must be lowercase kebab-case .md"),
        `${rel}/sponsorkit.md: \`kind\` must be one of index, package, module, namespace, class, struct, interface, trait, enum, type, function, constant, variable, error, other`,
        `${rel}/empty.md: page is empty`,
        `${rel}/h1.md:6: don't use \`#\` headings in the body; the page title comes from frontmatter`,
        // sponsorkit.md has invalid frontmatter, so it isn't loaded and links to it are broken.
        `${rel}/index.md:7: broken link: link target "sponsorkit.md" does not exist (${rel}/sponsorkit.md)`,
      ]),
    );
    expect(r.errors.some((e) => e.includes("missing.md"))).toBe(false);
  });

  it("checks links of loadable pages", async () => {
    const { web, out } = setup({
      ...good,
      "sponsorkit.md": page("Sponsorkit", "kind: class\n", "See [x](missing.md), [y](types/result.md#nope) and [z](/docs/concepts/targets#nope)."),
    });
    const r = await validateReference("js", out, { webDir: web });
    const rel = path.relative(path.dirname(web), out);
    expect(r.errors).toEqual([
      expect.stringMatching(new RegExp(`^${rel}/sponsorkit.md:7: broken link: link target "missing.md" does not exist`)),
      `${rel}/sponsorkit.md: link /docs/reference/js/types/result#nope points to a missing anchor #nope`,
      `${rel}/sponsorkit.md: link /docs/concepts/targets#nope points to a missing anchor #nope`,
      `${rel}/types/result.md: link /docs/reference/js/sponsorkit#signin points to a missing anchor #signin`,
    ]);
  });

  it("flags stubs and a missing folder", async () => {
    const { web, out } = setup({ ...good, "_meta.json": JSON.stringify({ lang: "js", generator: "stub", stub: true }) });
    const r = await validateReference("js", out, { webDir: web });
    expect(r.stub).toBe(true);
    expect(r.warnings).toContain('output is marked as a stub (_meta.json "stub": true)');
    const missing = await validateReference("js", `${out}-nope`, { webDir: web });
    expect(missing.errors[0]).toMatch(/does not exist/);
  });
});
