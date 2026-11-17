/** Guards the real content tree in web/content/docs: it loads, every page compiles, owners' areas exist. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REF_LANGS, generatorEntrypoint } from "./config";
import { compileMarkdown } from "./markdown";
import { loadDocsSite, resolveLink } from "./site";

const site = loadDocsSite({ strict: false });

describe("web/content/docs", () => {
  it("has no content errors", () => {
    expect(site.diagnostics.filter((d) => d.level === "error")).toEqual([]);
  });

  it("compiles every page without errors", async () => {
    const problems: string[] = [];
    for (const page of site.pages) {
      const c = await compileMarkdown(page.body, { highlight: false, resolveLink: (h) => resolveLink(site, page, h) });
      for (const d of c.diagnostics) if (d.level === "error") problems.push(`${page.repoPath ?? page.url}: ${d.message}`);
    }
    expect(problems).toEqual([]);
  });

  it("keeps the owner areas and their OWNERS notes", () => {
    const areas: Record<string, string> = {
      "getting-started": "guides-a",
      install: "guides-a",
      concepts: "guides-a",
      guides: "guides-b",
      "reference-http": "guides-b",
      ...Object.fromEntries(REF_LANGS.map((l) => [`languages/${l}`, `lang-${l}`])),
    };
    for (const [dir, owner] of Object.entries(areas)) {
      const file = path.join(site.dirs.contentDir, dir, "_section.md");
      expect(readFileSync(file, "utf8"), file).toContain(`OWNERS: ${owner}`);
      expect(site.byUrl.has(`/docs/${dir}`), dir).toBe(true);
    }
  });

  it("has a generator entrypoint for every SDK", () => {
    for (const l of REF_LANGS) expect(existsSync(path.join(site.dirs.repoDir, generatorEntrypoint(l))), l).toBe(true);
  });
});
