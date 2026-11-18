import { describe, expect, it } from "vitest";
import { checkLinks, fileForPath, urlForFile } from "./link-check";

const files = new Set([
  "index.html",
  "404.html",
  "docs.html",
  "docs/a.html",
  "docs/b/index.html",
  "icon.svg",
  "search-index.json",
  "_next/static/chunks/app.js",
  "_next/static/chunks/app.css",
]);

describe("path resolution", () => {
  it("maps files to URLs and back like the static server", () => {
    expect(urlForFile("docs/a.html")).toBe("/docs/a");
    expect(urlForFile("docs/b/index.html")).toBe("/docs/b/");
    expect(fileForPath("/docs", files)).toBe("docs.html");
    expect(fileForPath("/docs/b", files)).toBe("docs/b/index.html");
    expect(fileForPath("/docs/b/", files)).toBe("docs/b/index.html");
    expect(fileForPath("/icon.svg", files)).toBe("icon.svg");
    expect(fileForPath("/", files)).toBe("index.html");
    expect(fileForPath("/nope", files)).toBeNull();
  });
});

describe("checkLinks", () => {
  const html = new Map([
    ["index.html", '<a href="/docs/a#x">ok</a><a href="https://example.com">ext</a><a href="/api/v1/health">api</a><a href="/docs/a#nope">bad anchor</a>'],
    ["docs/a.html", '<h2 id="x">X</h2><a href="b">rel</a><a href="#x">self</a><a href="/missing">missing</a><a href="/icon.svg">i</a>'],
    ["docs.html", '<a href="/docs/a?x=1&amp;y=2#x">query</a>'],
  ]);
  it("reports missing pages and anchors only", () => {
    const r = checkLinks({ files, html, searchIndex: JSON.stringify({ entries: [{ u: "/docs/a#x" }, { u: "/docs/a#gone" }] }) });
    expect(r.broken).toEqual([
      { from: "index.html", href: "/docs/a#nope", reason: 'no element with id "nope"' },
      { from: "docs/a.html", href: "/missing", reason: "no such page" },
      { from: "search-index.json", href: "/docs/a#gone", reason: 'no element with id "gone"' },
    ]);
    expect(r.pages).toBe(3);
  });
  it("strips and enforces the base path", () => {
    const r = checkLinks({
      files,
      html: new Map([
        ["docs.html", '<a href="/sk/docs/a#x">ok</a><a href="/docs/a">no base</a>'],
        ["docs/a.html", '<h2 id="x">X</h2>'],
      ]),
      basePath: "/sk",
    });
    expect(r.broken).toEqual([{ from: "docs.html", href: "/docs/a", reason: "outside the base path /sk" }]);
  });
  it("checks <link href>, <script src> and <img src>, including /_next/ assets and the base path", () => {
    const r = checkLinks({
      files,
      html: new Map([
        [
          "docs.html",
          '<link rel="icon" href="/icon.svg"/><link rel="icon" href="/sk/icon.svg"/><link rel="canonical" href="https://sponsorkit.io/docs"/>' +
            '<link rel="stylesheet" href="/sk/_next/static/chunks/app.css"/><script src="/sk/_next/static/chunks/app.js"></script>' +
            '<script src="/sk/_next/static/chunks/gone.js"></script><img src="/sk/missing.png"/><script>var src="/x"</script>',
        ],
      ]),
      basePath: "/sk",
    });
    expect(r.broken).toEqual([
      { from: "docs.html", href: "/icon.svg", reason: "outside the base path /sk" },
      { from: "docs.html", href: "/sk/_next/static/chunks/gone.js", reason: "no such page" },
      { from: "docs.html", href: "/sk/missing.png", reason: "no such page" },
    ]);
  });
  it("checks absolute links and sitemap entries under the site URL", () => {
    const site = "https://example.github.io/sk";
    const r = checkLinks({
      files,
      html: new Map([
        [
          "docs.html",
          `<link rel="canonical" href="${site}/docs/a/"/><meta property="og:url" content="${site}/"/>` +
            `<a href="${site}/docs/gone/">gone</a><a href="https://example.github.io/other/">other site</a><a href="${site}/docs/a#x">x</a>`,
        ],
        ["docs/a.html", '<h2 id="x">X</h2>'],
      ]),
      sitemap: `<urlset><url><loc>${site}/docs/a/</loc></url><url><loc>${site}/nope/</loc></url><url><loc>https://elsewhere.example/</loc></url></urlset>`,
      basePath: "/sk",
      siteUrl: `${site}/`,
    });
    expect(r.broken).toEqual([
      { from: "docs.html", href: "/sk/docs/gone/", reason: "no such page" },
      { from: "sitemap.xml", href: "/sk/nope/", reason: "no such page" },
      { from: "sitemap.xml", href: "https://elsewhere.example/", reason: "not under the site URL https://example.github.io/sk" },
    ]);
  });
});
