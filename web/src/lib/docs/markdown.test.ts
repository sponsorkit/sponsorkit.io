import type { Element, Root } from "hast";
import { toHtml } from "hast-util-to-html";
import { describe, expect, it } from "vitest";
import { compileMarkdown, extractSections, parseMeta, tabKeyForLang } from "./markdown";

const html = async (md: string, opts = {}) => {
  const c = await compileMarkdown(md, { highlight: false, ...opts });
  return { ...c, html: toHtml(c.hast as Root) };
};

const find = (root: Root | Element, tag: string): Element[] => {
  const out: Element[] = [];
  const walk = (n: Root | Element) => {
    for (const c of n.children) {
      if (c.type !== "element") continue;
      if (c.tagName === tag) out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
};

describe("code fences", () => {
  it("parses meta strings", () => {
    expect(parseMeta('title="app.ts" tab=Node key=\'js\'')).toEqual({ title: "app.ts", tab: "Node", key: "js" });
  });
  it("maps languages to SDK tab keys", () => {
    expect(["ts", "tsx", "javascript", "csharp", "cs", "py", "go", "rs", "bash"].map(tabKeyForLang)).toEqual([
      "js",
      "js",
      "js",
      "dotnet",
      "dotnet",
      "python",
      "go",
      "rust",
      "bash",
    ]);
  });
  it("wraps code in a figure with a title and a copy button", async () => {
    const { html: out } = await html('```ts title="app.ts"\nconst a = 1;\n```');
    expect(out).toContain('<figure class="code" data-lang="ts">');
    expect(out).toContain('<figcaption class="code-title"><span>app.ts</span><sk-copy></sk-copy></figcaption>');
  });
  it("adds a floating copy button to untitled blocks", async () => {
    const { html: out } = await html("```\nplain\n```");
    expect(out).toContain('<div class="code-toolbar"><sk-copy></sk-copy></div>');
  });
  it("highlights with Shiki (dual themes)", async () => {
    const c = await compileMarkdown("```ts\nconst a = 1;\n```");
    const out = toHtml(c.hast);
    expect(out).toMatch(/<pre class="shiki shiki-themes github-light github-dark"[^>]*--shiki-dark/);
  });
  it("warns about unknown languages and renders them plain", async () => {
    const c = await compileMarkdown("```nosuchlang\nx\n```");
    expect(c.diagnostics).toEqual([expect.objectContaining({ level: "warning", message: expect.stringContaining("nosuchlang") })]);
    expect(find(c.hast, "pre")).toHaveLength(1);
  });
});

describe("tabs", () => {
  it("turns code fences into tabs keyed by SDK language", async () => {
    const c = await html(':::tabs\n```ts title="a.ts"\na\n```\n\n```python\nb\n```\n\n```rust\nc\n```\n:::');
    expect(c.diagnostics).toEqual([]);
    const tabs = find(c.hast, "sk-tabs")[0]!;
    expect(tabs.properties.dataGroup).toBe("lang");
    expect(JSON.parse(String(tabs.properties.dataTabs))).toEqual([
      { key: "js", label: "JavaScript" },
      { key: "python", label: "Python" },
      { key: "rust", label: "Rust" },
    ]);
    expect(find(tabs, "sk-tab").map((t) => t.properties.dataKey)).toEqual(["js", "python", "rust"]);
  });
  it("supports explicit tab/key, custom groups and :::tab containers", async () => {
    const md = [
      '::::tabs{group="pm"}',
      ':::tab[npm]',
      "Run it.",
      "```bash",
      "npm i",
      "```",
      ":::",
      ':::tab[Python]',
      "Text only.",
      ":::",
      "::::",
      "",
      ":::tabs",
      '```bash tab="Bun" key="bun"',
      "bun add x",
      "```",
      "```bash tab=Deno key=deno",
      "deno add x",
      "```",
      ":::",
    ].join("\n");
    const c = await html(md);
    expect(c.diagnostics).toEqual([]);
    const [a, b] = find(c.hast, "sk-tabs");
    expect(a!.properties.dataGroup).toBe("pm");
    expect(JSON.parse(String(a!.properties.dataTabs))).toEqual([
      { key: "npm", label: "npm" },
      { key: "python", label: "Python" },
    ]);
    expect(JSON.parse(String(b!.properties.dataTabs))).toEqual([
      { key: "bun", label: "Bun" },
      { key: "deno", label: "Deno" },
    ]);
  });
  it("rejects duplicate keys, stray content, nesting and orphan :::tab", async () => {
    const dup = await html(":::tabs\n```bash\na\n```\n```bash\nb\n```\n:::");
    expect(dup.diagnostics.map((d) => d.message)).toEqual([expect.stringContaining('duplicate tab key "bash"')]);
    const stray = await html(":::tabs\nJust text.\n:::");
    expect(stray.diagnostics.some((d) => d.message.includes("only fenced code blocks"))).toBe(true);
    const orphan = await html(":::tab[X]\nhi\n:::");
    expect(orphan.diagnostics.map((d) => d.message)).toEqual([":::tab must be directly inside :::tabs"]);
    const nested = await html("::::tabs\n:::tab[A]\n:::tabs\n```ts\nx\n```\n:::\n:::\n::::");
    expect(nested.diagnostics.some((d) => d.message.includes("cannot be nested"))).toBe(true);
  });
});

describe("callouts", () => {
  it("renders :::note/:::tip/:::warning/:::danger with default or custom titles", async () => {
    const c = await html(":::warning\nCareful.\n:::\n\n:::tip[Try this]\nGo.\n:::");
    expect(c.diagnostics).toEqual([]);
    expect(c.html).toContain('<div class="callout callout-warning" role="note"><p class="callout-title">Warning</p>');
    expect(c.html).toContain('<div class="callout callout-tip" role="note"><p class="callout-title">Try this</p>');
  });
  it("supports GitHub alerts", async () => {
    const c = await html("> [!CAUTION]\n> Do not.");
    expect(c.html).toMatch(/^<div class="callout callout-danger" role="note">\s*<p class="callout-title">Danger<\/p>/);
    expect(c.html).toContain("Do not.");
  });
  it("rejects unknown container directives but keeps text directives as text", async () => {
    const c = await html(":::nope\nx\n:::\n\nTargets look like github:octocat and opencollective:sponsorkit.");
    expect(c.diagnostics.map((d) => d.message)).toEqual([expect.stringContaining('unknown directive ":::nope"')]);
    expect(c.html).toContain("github:octocat and opencollective:sponsorkit");
  });
});

describe("headings", () => {
  it("assigns GitHub slugs, explicit ids and permalinks; collects the TOC", async () => {
    const c = await html("## Sign-in & sessions\n\n### Tokens {#tokens}\n\n## Sign-in & sessions\n\n#### Deep");
    expect(c.ids).toEqual(["sign-in--sessions", "tokens", "sign-in--sessions-1", "deep"]);
    expect(c.toc).toEqual([
      { depth: 2, id: "sign-in--sessions", text: "Sign-in & sessions" },
      { depth: 3, id: "tokens", text: "Tokens" },
      { depth: 2, id: "sign-in--sessions-1", text: "Sign-in & sessions" },
    ]);
    expect(c.html).toContain('<h3 id="tokens">Tokens<a class="anchor" href="#tokens" aria-label="Link to section: Tokens">#</a></h3>');
  });
  it("rejects H1, duplicate explicit ids and malformed ids", async () => {
    const c = await html("# Title\n\n## A {#x}\n\n## B {#x}\n\n## C {#Bad.Id}");
    const msgs = c.diagnostics.map((d) => d.message);
    expect(msgs).toContain("don't use `#` headings in the body; the page title comes from frontmatter");
    expect(msgs).toContain('duplicate heading id "x"');
    expect(msgs.some((m) => m.startsWith("invalid explicit heading id"))).toBe(true);
    expect(c.diagnostics.find((d) => d.message.includes("duplicate"))!.line).toBe(5);
  });
});

describe("links and tables", () => {
  it("passes every link and definition through the resolver", async () => {
    const seen: string[] = [];
    const c = await html("[a](a.md) [b][b] [c](/docs/missing)\n\n[b]: ../b.md#x", {
      resolveLink: (href: string) => {
        seen.push(href);
        if (href === "/docs/missing") return { error: "no docs page at /docs/missing" };
        return { href: `/docs/${href.replace(/\.md/, "").replace("../", "")}` };
      },
    });
    expect(seen.sort()).toEqual(["../b.md#x", "/docs/missing", "a.md"]);
    expect(c.html).toContain('<a href="/docs/a">a</a>');
    expect(c.html).toContain('<a href="/docs/b#x">b</a>');
    expect(c.diagnostics).toEqual([{ level: "error", line: 1, message: "broken link: no docs page at /docs/missing" }]);
  });
  it("wraps tables in a scrollable region", async () => {
    const c = await html("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(c.html).toMatch(/^<div class="table-wrap" tabindex="0" role="region" aria-label="Table"><table>/);
  });
});

describe("extractSections", () => {
  it("splits at h2/h3 with the renderer's ids", () => {
    const s = extractSections("Intro text.\n\n## One\n\nAlpha `code`.\n\n### Two {#two-x}\n\n```ts\nbeta()\n```\n\n#### Four\n\nGamma.");
    expect(s).toEqual([
      { id: null, heading: null, depth: 1, text: "Intro text." },
      { id: "one", heading: "One", depth: 2, text: "Alpha code." },
      { id: "two-x", heading: "Two", depth: 3, text: "beta() Four Gamma." },
    ]);
  });
});
