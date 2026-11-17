import path from "node:path";
import { describe, expect, it } from "vitest";
import { type NavNode, type NavSection, ancestorsOf, flattenNav, loadDocsSite, prevNext, resolveLink } from "./site";
import { makeWeb, page, section } from "./test-fixtures";

const labels = (nodes: NavNode[]): unknown[] =>
  nodes.map((n) => (n.type === "page" ? `${n.label} ${n.url}` : { [n.title]: labels(n.children) }));

function fixture() {
  const web = makeWeb({
    "content/docs/CONTRIBUTING-DOCS.md": "notes for authors, no frontmatter",
    "content/docs/concepts/_section.md": section("Concepts", 30),
    "content/docs/concepts/index.md": page("Concepts"),
    "content/docs/concepts/targets.md": page("Targets", "order: 10\n", "## Target sets\n\nSee [sessions](sessions.md#tokens)."),
    "content/docs/concepts/sessions.md": page("Sign-in & sessions", "order: 20\nsidebar_label: Sign-in\n", "## Tokens {#tokens}"),
    "content/docs/getting-started/_section.md": section("Getting started", 10),
    "content/docs/getting-started/quickstart.md": page("Quickstart"),
    "content/docs/getting-started/install.md": page("Install"),
    "content/docs/languages/_section.md": section("Languages", 50),
    "content/docs/languages/go/_section.md": section("Go", 40, "collapsed: true\n"),
    "content/docs/languages/go/index.md": page("Sponsorkit for Go"),
    ".generated/reference/go/_meta.json": '{"lang":"go","generator":"test"}',
    ".generated/reference/go/index.md": page("Go API reference", "kind: index\n", "See [Client](client.md#new)."),
    ".generated/reference/go/client.md": page("Client", "kind: struct\nsymbol: sponsorkit.Client\nsource: sdks/go/client.go#L10\n", "### New {#new}"),
    ".generated/reference/go/types/result.md": page("Result", "kind: struct\n"),
  });
  return { web, site: loadDocsSite({ webDir: web, strict: false }) };
}

describe("loadDocsSite", () => {
  it("derives the sidebar from folders and frontmatter", () => {
    const { site } = fixture();
    expect(site.diagnostics.filter((d) => d.level === "error")).toEqual([]);
    expect(labels(site.nav)).toEqual([
      "Overview /docs",
      { "Getting started": ["Install /docs/getting-started/install", "Quickstart /docs/getting-started/quickstart"] },
      { Concepts: ["Overview /docs/concepts", "Targets /docs/concepts/targets", "Sign-in /docs/concepts/sessions"] },
      { Languages: [{ Go: ["Overview /docs/languages/go"] }] },
      {
        "API reference": [
          "Overview /docs/reference",
          { "JavaScript / TypeScript": ["Overview /docs/reference/js"] },
          { ".NET": ["Overview /docs/reference/dotnet"] },
          { Python: ["Overview /docs/reference/python"] },
          { Go: ["Overview /docs/reference/go", "Client /docs/reference/go/client", { types: ["Result /docs/reference/go/types/result"] }] },
          { Rust: ["Overview /docs/reference/rust"] },
        ],
      },
    ]);
    const go = (site.nav.at(-1) as NavSection).children[4] as NavSection;
    expect(go.collapsed).toBe(true);
  });

  it("maps files to URLs, edit links and source links", () => {
    const { site, web } = fixture();
    const targets = site.byUrl.get("/docs/concepts/targets")!;
    expect(targets.file).toBe(path.join(web, "content/docs/concepts/targets.md"));
    expect(targets.editUrl).toBe("https://github.com/sponsorkit/sponsorkit.io/edit/main/web/content/docs/concepts/targets.md");
    const client = site.byUrl.get("/docs/reference/go/client")!;
    expect(client).toMatchObject({ realm: "reference", lang: "go", kind: "struct", symbol: "sponsorkit.Client", editUrl: null });
    expect(client.sourceUrl).toBe("https://github.com/sponsorkit/sponsorkit.io/blob/main/sdks/go/client.go#L10");
    expect(site.byUrl.has("/docs/contributing-docs")).toBe(false);
  });

  it("renders placeholders for missing references, and fails in strict mode", () => {
    const { site, web } = fixture();
    expect(site.refStatus).toEqual({ js: "missing", dotnet: "missing", python: "missing", go: "present", rust: "missing" });
    const js = site.byUrl.get("/docs/reference/js")!;
    expect(js.placeholder).toBe(true);
    expect(js.body).toContain("bun run --cwd web docs:generate --only js");
    expect(site.diagnostics.filter((d) => d.level === "error")).toEqual([]);
    const strict = loadDocsSite({ webDir: web, strict: true });
    expect(strict.diagnostics.filter((d) => d.level === "error").map((d) => d.file)).toEqual([
      "web/.generated/reference/js",
      "web/.generated/reference/dotnet",
      "web/.generated/reference/python",
      "web/.generated/reference/rust",
    ]);
  });

  it("marks stub output", () => {
    const web = makeWeb({
      ".generated/reference/rust/_meta.json": '{"lang":"rust","generator":"stub","stub":true}',
      ".generated/reference/rust/index.md": page("Rust API reference"),
    });
    const site = loadDocsSite({ webDir: web, strict: true });
    expect(site.refStatus.rust).toBe("stub");
    expect(site.byUrl.get("/docs/reference/rust")!.stub).toBe(true);
  });

  it("reports content errors", () => {
    const web = makeWeb({
      "content/docs/nosection/a.md": page("A"),
      "content/docs/reference/_section.md": section("Ref", 1),
      "content/docs/reference/x.md": page("X"),
      "content/docs/Bad_Name/_section.md": section("Bad", 1),
      "content/docs/b.md": "---\ntitle: B\nfoo: 1\n---\n",
      "content/docs/c.md": "no frontmatter",
      "content/docs/dup.md": page("Dup"),
      "content/docs/dup/_section.md": section("Dup", 2),
      "content/docs/dup/index.md": page("Dup index"),
      "content/docs/big/_section.md": section("Big", 1000),
      "content/docs/big/a.md": page("A"),
    });
    const site = loadDocsSite({ webDir: web, strict: false });
    const errors = site.diagnostics.filter((d) => d.level === "error").map((d) => `${d.file}: ${d.message}`);
    expect(errors).toEqual(
      expect.arrayContaining([
        "web/content/docs/nosection: folder is missing _section.md (title, order)",
        "web/content/docs/reference: `reference/` is reserved for the generated API reference (/docs/reference)",
        "web/content/docs/Bad_Name: folder names must be lowercase kebab-case",
        "web/content/docs/b.md: unknown frontmatter field `foo`",
        "web/content/docs/b.md: `description` is required",
        "web/content/docs/c.md: missing YAML frontmatter (the file must start with a `---` block)",
        "web/content/docs/dup.md: URL /docs/dup is also produced by web/content/docs/dup/index.md",
        "/docs/big: section order must be < 1000",
      ]),
    );
  });
});

describe("resolveLink", () => {
  const { site } = fixture();
  const targets = site.byUrl.get("/docs/concepts/targets")!;
  const client = site.byUrl.get("/docs/reference/go/client")!;
  const goIndex = site.byUrl.get("/docs/reference/go")!;

  it.each([
    ["sessions.md#tokens", "/docs/concepts/sessions#tokens"],
    ["./index.md", "/docs/concepts"],
    ["../getting-started/quickstart.md?x=1#a", "/docs/getting-started/quickstart?x=1#a"],
    ["../index.md", "/docs"],
    ["/docs/concepts/targets/", "/docs/concepts/targets"],
    ["/docs/concepts/index.md", "/docs/concepts"],
    ["/docs/reference/go/client#new", "/docs/reference/go/client#new"],
    ["#target-sets", "#target-sets"],
    ["https://example.com/x.md", "https://example.com/x.md"],
    ["mailto:a@b.c", "mailto:a@b.c"],
    ["/connect/done", "/connect/done"],
    ["/", "/"],
  ])("%s → %s", (href, expected) => {
    expect(resolveLink(site, targets, href)).toEqual({ href: expected });
  });

  it.each([
    ["missing.md", /does not exist/],
    ["sessions", /must point to a \.md file/],
    ["/docs/nope", /no docs page at \/docs\/nope/],
    ["/pricing", /unknown site path/],
  ])("%s is broken", (href, error) => {
    const r = resolveLink(site, targets, href);
    expect("error" in r && r.error).toMatch(error);
  });

  it("falls back to a missing reference's index (non-strict) with a warning", () => {
    expect(resolveLink(site, targets, "/docs/reference/js/sponsorkit#signin")).toEqual({
      href: "/docs/reference/js",
      warning: expect.stringContaining("isn't generated"),
    });
    const strict = loadDocsSite({ webDir: fixture().web, strict: true });
    expect(resolveLink(strict, strict.byUrl.get("/docs/concepts/targets")!, "/docs/reference/js/x")).toEqual({
      error: expect.stringContaining("isn't generated"),
    });
  });

  it("keeps reference links inside their language tree", () => {
    expect(resolveLink(site, goIndex, "client.md#new")).toEqual({ href: "/docs/reference/go/client#new" });
    expect(resolveLink(site, client, "types/result.md")).toEqual({ href: "/docs/reference/go/types/result" });
    expect(resolveLink(site, client, "/docs/concepts/targets")).toEqual({ href: "/docs/concepts/targets" });
    const r = resolveLink(site, client, "../../../content/docs/concepts/targets.md");
    expect("error" in r).toBe(true);
  });
});

describe("navigation helpers", () => {
  const { site } = fixture();
  it("flattens in sidebar order", () => {
    expect(flattenNav(site.nav).slice(0, 4)).toEqual(["/docs", "/docs/getting-started/install", "/docs/getting-started/quickstart", "/docs/concepts"]);
  });
  it("finds breadcrumbs", () => {
    expect(ancestorsOf(site.nav, "/docs/reference/go/types/result").map((s) => s.title)).toEqual(["API reference", "Go", "types"]);
    expect(ancestorsOf(site.nav, "/docs/concepts").map((s) => s.title)).toEqual(["Concepts"]);
  });
  it("links prev/next within docs, and within one reference language", () => {
    const pn = (u: string) => {
      const r = prevNext(site, site.byUrl.get(u)!);
      return [r.prev?.url ?? null, r.next?.url ?? null];
    };
    expect(pn("/docs")).toEqual([null, "/docs/getting-started/install"]);
    expect(pn("/docs/languages/go")).toEqual(["/docs/concepts/sessions", null]);
    expect(pn("/docs/reference/go")).toEqual([null, "/docs/reference/go/client"]);
    expect(pn("/docs/reference/go/types/result")).toEqual(["/docs/reference/go/client", null]);
  });
});
