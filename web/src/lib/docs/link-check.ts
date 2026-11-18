/** Pure core of scripts/check-links.ts (unit-tested). */

export interface BrokenLink {
  from: string;
  href: string;
  reason: string;
}

export interface LinkCheckResult {
  pages: number;
  checked: number;
  broken: BrokenLink[];
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#x27;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">" };
const decodeHtml = (s: string) => s.replace(/&(?:amp|quot|#x27|#39|lt|gt);/g, (m) => ENTITIES[m] ?? m);

/** Ids (and legacy `name` anchors) defined in an HTML document. */
export function idsIn(html: string): Set<string> {
  const ids = new Set<string>();
  for (const m of html.matchAll(/\s(?:id|name)="([^"]*)"/g)) ids.add(decodeHtml(m[1]!));
  return ids;
}

/** `href`s of <a> elements. */
export function hrefsIn(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)].map((m) => decodeHtml(m[1]!));
}

/** URLs of assets a page loads: <link href>, <script src> and <img src>. */
export function assetRefsIn(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*?\shref="([^"]*)"/g)) out.push(decodeHtml(m[1]!));
  for (const m of html.matchAll(/<(?:script|img)\b[^>]*?\ssrc="([^"]*)"/g)) out.push(decodeHtml(m[1]!));
  return out;
}

/** URL path a file is served at: docs/concepts.html → /docs/concepts, docs/index.html → /docs/. */
export function urlForFile(file: string): string {
  if (file === "index.html") return "/";
  if (file.endsWith("/index.html")) return `/${file.slice(0, -"index.html".length)}`;
  return `/${file.replace(/\.html$/, "")}`;
}

/** Same resolution as scripts/serve.mjs and Workers static assets. */
export function fileForPath(pathname: string, files: Set<string>): string | null {
  const p = pathname.replace(/^\/+/, "");
  const candidates = pathname.endsWith("/")
    ? [`${p}index.html`, `${p.replace(/\/$/, "")}.html`]
    : [p, `${p}.html`, `${p}/index.html`];
  for (const c of candidates) if (c && files.has(c)) return c;
  if (pathname === "/" && files.has("index.html")) return "index.html";
  return null;
}

export interface LinkCheckInput {
  /** Every file in the export (relative paths with `/`). */
  files: Set<string>;
  /** Contents of the HTML files to check (relative path → HTML). */
  html: Map<string, string>;
  /** Contents of search-index.json, if any. */
  searchIndex?: string;
  /** Contents of sitemap.xml, if any: every `<loc>` must be a page of this site. */
  sitemap?: string;
  basePath?: string;
  /**
   * Absolute site base URL (origin + base path), e.g. `https://sponsorkit.github.io/sponsorkit.io`.
   * Absolute links under it (canonical, og:url, sitemap) are checked like internal ones.
   */
  siteUrl?: string;
}

export function checkLinks(input: LinkCheckInput): LinkCheckResult {
  const base = (input.basePath ?? "").replace(/\/+$/, "");
  const siteUrl = (input.siteUrl ?? "").replace(/\/+$/, "");
  const siteOrigin = siteUrl ? new URL(siteUrl).origin : "";
  const idCache = new Map<string, Set<string>>();
  const ids = (file: string) => {
    let s = idCache.get(file);
    if (!s) {
      s = idsIn(input.html.get(file) ?? "");
      idCache.set(file, s);
    }
    return s;
  };
  const broken: BrokenLink[] = [];
  let checked = 0;

  // Assets (asset = true) are only checked for existence, and /_next/ files are included, so a
  // missing base path on an icon, stylesheet or script is caught too.
  const check = (from: string, href: string, pageUrl: string, asset = false) => {
    if (!href || href === "#") return;
    // An absolute URL on this site: check its path (which must then carry the base path).
    if (siteUrl && (href === siteUrl || href.startsWith(`${siteUrl}/`) || href.startsWith(`${siteUrl}?`) || href.startsWith(`${siteUrl}#`))) {
      href = href.slice(siteOrigin.length) || "/";
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return;
    let url: URL;
    try {
      url = new URL(href, `http://site.invalid${base}${pageUrl}`);
    } catch {
      broken.push({ from, href, reason: "malformed URL" });
      return;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      broken.push({ from, href, reason: "malformed URL encoding" });
      return;
    }
    if (base) {
      if (pathname !== base && !pathname.startsWith(`${base}/`)) {
        broken.push({ from, href, reason: `outside the base path ${base}` });
        return;
      }
      pathname = pathname.slice(base.length) || "/";
    }
    if (pathname.startsWith("/api/") || (!asset && pathname.startsWith("/_next/"))) return;
    checked++;
    const target = fileForPath(pathname, input.files);
    if (!target) {
      broken.push({ from, href, reason: "no such page" });
      return;
    }
    if (asset) return;
    const hash = url.hash ? decodeURIComponent(url.hash.slice(1)) : "";
    if (hash && target.endsWith(".html") && !ids(target).has(hash)) broken.push({ from, href, reason: `no element with id "${hash}"` });
  };

  for (const [file, html] of input.html) {
    const pageUrl = urlForFile(file);
    for (const href of hrefsIn(html)) check(file, href, pageUrl);
    for (const src of assetRefsIn(html)) check(file, src, pageUrl, true);
  }
  if (input.searchIndex) {
    const index = JSON.parse(input.searchIndex) as { entries: { u: string }[] };
    for (const e of index.entries) check("search-index.json", `${base}${e.u}`, "/");
  }
  if (input.sitemap) {
    for (const m of input.sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)) {
      const loc = decodeHtml(m[1]!.trim());
      if (siteUrl && !(loc === siteUrl || loc.startsWith(`${siteUrl}/`))) {
        broken.push({ from: "sitemap.xml", href: loc, reason: `not under the site URL ${siteUrl}` });
        continue;
      }
      check("sitemap.xml", loc, "/");
    }
  }
  return { pages: input.html.size, checked, broken };
}
