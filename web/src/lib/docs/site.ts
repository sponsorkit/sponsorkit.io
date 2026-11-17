/**
 * Loads the docs content tree (web/content/docs) and the generated API reference
 * (web/.generated/reference/<lang>) into one route table + sidebar tree, and resolves links.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  BLOB_BASE_URL,
  DOCS_PREFIX,
  EDIT_BASE_URL,
  LANG_INFO,
  REF_LANGS,
  REFERENCE_PREFIX,
  type DocsDirs,
  type RefLang,
  SITE_PATHS,
  docsDirs,
  generatorEntrypoint,
  isStrict,
} from "./config";
import {
  DEFAULT_ORDER,
  FrontmatterError,
  type ReferenceKind,
  parsePageFrontmatter,
  parseReferenceFrontmatter,
  parseSectionFrontmatter,
  splitFrontmatter,
} from "./frontmatter";

export type Realm = "docs" | "reference";

export interface DocPage {
  /** e.g. `/docs/concepts/targets` (no trailing slash). */
  url: string;
  /** Route segments after /docs, e.g. `["concepts", "targets"]`; `[]` for /docs. */
  slug: string[];
  realm: Realm;
  /** Set for reference pages of one language. */
  lang?: RefLang;
  title: string;
  description: string;
  order: number;
  navLabel: string;
  toc: boolean;
  kind?: ReferenceKind;
  symbol?: string;
  /** Markdown body (without frontmatter). */
  body: string;
  /** 1-based line in `file` where `body` starts. */
  bodyLine: number;
  /** Absolute source file; null for synthesized pages (reference overview, placeholders). */
  file: string | null;
  /** Repo-relative source path (for diagnostics / edit links). */
  repoPath: string | null;
  /** "Edit this page on GitHub" URL (hand-written pages only). */
  editUrl: string | null;
  /** "View source" URL (reference pages with a `source` frontmatter field). */
  sourceUrl: string | null;
  /** Synthesized placeholder for a language whose reference hasn't been generated. */
  placeholder: boolean;
  /** Output of a stub generator (`_meta.json` has `"stub": true`). */
  stub: boolean;
}

export interface NavPage {
  type: "page";
  url: string;
  label: string;
  order: number;
}

export interface NavSection {
  type: "section";
  /** Folder URL, e.g. `/docs/concepts` (also used as a stable key). */
  id: string;
  title: string;
  order: number;
  collapsed: boolean;
  /** URL of the folder's index.md page, if any (always also the section's first child). */
  url: string | null;
  children: NavNode[];
}

export type NavNode = NavPage | NavSection;

export type RefStatus = "present" | "stub" | "missing";

export interface Diagnostic {
  level: "error" | "warning";
  /** Repo-relative path or a description of the location. */
  file: string;
  message: string;
}

export interface DocsSite {
  dirs: DocsDirs;
  strict: boolean;
  pages: DocPage[];
  byUrl: Map<string, DocPage>;
  /** Absolute file path → page. */
  byFile: Map<string, DocPage>;
  nav: NavNode[];
  refStatus: Record<RefLang, RefStatus>;
  diagnostics: Diagnostic[];
}

/** File and folder names in the docs trees: lowercase kebab-case. */
export const SEGMENT_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Sidebar order of the generated "API reference" group; content sections must use smaller orders. */
export const REFERENCE_SECTION_ORDER = 1000;

interface TreeCtx {
  realm: Realm;
  lang?: RefLang;
  /** Absolute root of this tree. */
  root: string;
  dirs: DocsDirs;
  stub: boolean;
  diagnostics: Diagnostic[];
  pages: DocPage[];
}

const rel = (dirs: DocsDirs, abs: string) => path.relative(dirs.repoDir, abs).split(path.sep).join("/");

export function urlOf(slug: string[]): string {
  return slug.length ? `${DOCS_PREFIX}/${slug.join("/")}` : DOCS_PREFIX;
}

function byOrder(a: NavNode, b: NavNode): number {
  const la = a.type === "page" ? a.label : a.title;
  const lb = b.type === "page" ? b.label : b.title;
  return a.order - b.order || la.localeCompare(lb);
}

function readPage(file: string, slug: string[], ctx: TreeCtx, isIndex: boolean): DocPage | null {
  const repoPath = rel(ctx.dirs, file);
  let split;
  try {
    split = splitFrontmatter(readFileSync(file, "utf8"));
  } catch (e) {
    ctx.diagnostics.push({ level: "error", file: repoPath, message: (e as Error).message });
    return null;
  }
  try {
    const fm = ctx.realm === "reference" ? parseReferenceFrontmatter(split.data) : parsePageFrontmatter(split.data);
    const kind = "kind" in fm ? (fm.kind as ReferenceKind | undefined) : undefined;
    const symbol = "symbol" in fm ? (fm.symbol as string | undefined) : undefined;
    const source = "source" in fm ? (fm.source as string | undefined) : undefined;
    return {
      url: urlOf(slug),
      slug,
      realm: ctx.realm,
      ...(ctx.lang ? { lang: ctx.lang } : {}),
      title: fm.title,
      description: fm.description,
      order: fm.order,
      navLabel: fm.sidebar_label ?? (isIndex ? "Overview" : fm.title),
      toc: fm.toc,
      ...(kind ? { kind } : {}),
      ...(symbol ? { symbol } : {}),
      body: split.body,
      bodyLine: split.bodyLine,
      file,
      repoPath,
      editUrl: ctx.realm === "docs" ? EDIT_BASE_URL + repoPath : null,
      sourceUrl: source ? BLOB_BASE_URL + source : null,
      placeholder: false,
      stub: ctx.stub,
    };
  } catch (e) {
    const problems = e instanceof FrontmatterError ? e.problems : [(e as Error).message];
    for (const p of problems) ctx.diagnostics.push({ level: "error", file: repoPath, message: p });
    return null;
  }
}

interface DirResult {
  children: NavNode[];
  indexUrl: string | null;
  pageCount: number;
}

function loadDir(dir: string, slug: string[], ctx: TreeCtx): DirResult {
  const children: NavNode[] = [];
  let index: NavPage | null = null;
  let pageCount = 0;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const isTreeRoot = dir === ctx.root;
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.name.startsWith(".")) continue;
    if (e.isDirectory()) {
      if (!SEGMENT_RE.test(e.name)) {
        ctx.diagnostics.push({ level: "error", file: rel(ctx.dirs, abs), message: "folder names must be lowercase kebab-case" });
        continue;
      }
      if (ctx.realm === "docs" && isTreeRoot && e.name === "reference") {
        ctx.diagnostics.push({
          level: "error",
          file: rel(ctx.dirs, abs),
          message: "`reference/` is reserved for the generated API reference (/docs/reference)",
        });
        continue;
      }
      const sectionFile = path.join(abs, "_section.md");
      let meta = { title: e.name, order: DEFAULT_ORDER, collapsed: false };
      if (existsSync(sectionFile)) {
        try {
          meta = parseSectionFrontmatter(splitFrontmatter(readFileSync(sectionFile, "utf8")).data);
        } catch (err) {
          const problems = err instanceof FrontmatterError ? err.problems : [(err as Error).message];
          for (const p of problems) ctx.diagnostics.push({ level: "error", file: rel(ctx.dirs, sectionFile), message: p });
        }
      } else if (ctx.realm === "docs") {
        ctx.diagnostics.push({ level: "error", file: rel(ctx.dirs, abs), message: "folder is missing _section.md (title, order)" });
      }
      const sub = loadDir(abs, [...slug, e.name], ctx);
      pageCount += sub.pageCount;
      if (sub.pageCount === 0) {
        ctx.diagnostics.push({ level: "warning", file: rel(ctx.dirs, abs), message: "folder has no pages; it is not shown" });
        continue;
      }
      children.push({
        type: "section",
        id: urlOf([...slug, e.name]),
        title: meta.title,
        order: meta.order,
        collapsed: meta.collapsed,
        url: sub.indexUrl,
        children: sub.children,
      });
      continue;
    }
    if (!e.isFile()) continue;
    if (e.name === "_section.md") continue;
    if (e.name === "_meta.json" && ctx.realm === "reference" && isTreeRoot) continue;
    if (!e.name.endsWith(".md")) {
      if (ctx.realm === "reference")
        ctx.diagnostics.push({ level: "warning", file: rel(ctx.dirs, abs), message: "ignored: only .md files are rendered" });
      continue;
    }
    const base = e.name.slice(0, -3);
    if (ctx.realm === "docs" && /[A-Z]/.test(base)) continue; // README.md, CONTRIBUTING-DOCS.md: notes for authors, not pages
    if (base.startsWith("_") || !SEGMENT_RE.test(base)) {
      ctx.diagnostics.push({ level: "error", file: rel(ctx.dirs, abs), message: "page file names must be lowercase kebab-case .md" });
      continue;
    }
    const isIndex = base === "index";
    const pageSlug = isIndex ? slug : [...slug, base];
    const page = readPage(abs, pageSlug, ctx, isIndex);
    if (!page) continue;
    ctx.pages.push(page);
    pageCount++;
    const node: NavPage = { type: "page", url: page.url, label: page.navLabel, order: page.order };
    if (isIndex) index = node;
    else children.push(node);
  }
  children.sort(byOrder);
  if (index) children.unshift(index);
  return { children, indexUrl: index?.url ?? null, pageCount };
}

function readMeta(file: string): { stub: boolean } | null {
  try {
    const meta = JSON.parse(readFileSync(file, "utf8")) as { stub?: unknown };
    return { stub: meta.stub === true };
  } catch {
    return null;
  }
}

function placeholderBody(lang: RefLang): string {
  const info = LANG_INFO[lang];
  return `:::note[Not generated in this build]
The ${info.label} API reference is generated from the SDK source code and wasn't generated for this build.
:::

To generate it locally, run the generator and rebuild the site:

\`\`\`bash
bun run --cwd web docs:generate --only ${lang}
bun run --cwd web build
\`\`\`

The generator entrypoint is \`${generatorEntrypoint(lang)}\`; it writes Markdown into \`web/.generated/reference/${lang}/\`.
Until then, see the [${info.label} guide](/docs/languages/${lang}).
`;
}

function overviewBody(status: Record<RefLang, RefStatus>): string {
  const rows = REF_LANGS.map((l) => {
    const s = status[l] === "present" ? "Generated" : status[l] === "stub" ? "Placeholder (stub generator)" : "Not generated";
    return `| [${LANG_INFO[l].label}](/docs/reference/${l}) | \`${LANG_INFO[l].pkg}\` | ${s} |`;
  });
  return `Every SDK exposes the same behaviour and result shape; only names follow each language's conventions.
The reference pages below are generated from each SDK's source code and doc comments.

| Language | Package | Reference |
|---|---|---|
${rows.join("\n")}

For the HTTP API the SDKs are built on, see the [HTTP API reference](/docs/reference-http).
`;
}

let cache: { key: string; site: DocsSite } | null = null;

export interface LoadOptions {
  webDir?: string;
  /** Override the generated reference root (default web/.generated/reference). */
  generatedDir?: string;
  /** Override single languages' reference folders (used by the validator). */
  referenceDirs?: Partial<Record<RefLang, string>>;
  strict?: boolean;
}

/** Loads the whole docs site. Cached in production builds; re-read on every call otherwise. */
export function loadDocsSite(opts: LoadOptions = {}): DocsSite {
  const dirs = docsDirs(opts.webDir);
  if (opts.generatedDir) dirs.generatedDir = path.resolve(opts.generatedDir);
  const strict = opts.strict ?? isStrict();
  const key = JSON.stringify([dirs, strict, opts.referenceDirs ?? null]);
  if (process.env.NODE_ENV === "production" && cache?.key === key) return cache.site;

  const diagnostics: Diagnostic[] = [];
  const pages: DocPage[] = [];
  const nav: NavNode[] = [];

  // Hand-written docs.
  if (!existsSync(dirs.contentDir)) throw new Error(`docs content folder not found: ${dirs.contentDir}`);
  const docs = loadDir(dirs.contentDir, [], { realm: "docs", root: dirs.contentDir, dirs, stub: false, diagnostics, pages });
  if (!pages.some((p) => p.url === DOCS_PREFIX))
    diagnostics.push({ level: "error", file: rel(dirs, dirs.contentDir), message: "missing index.md (the /docs home page)" });
  nav.push(...docs.children);
  for (const n of nav)
    if (n.type === "section" && n.order >= REFERENCE_SECTION_ORDER)
      diagnostics.push({ level: "error", file: n.id, message: `section order must be < ${REFERENCE_SECTION_ORDER}` });

  // Generated API reference.
  const refStatus = {} as Record<RefLang, RefStatus>;
  const refChildren: NavNode[] = [];
  REF_LANGS.forEach((lang, i) => {
    const override = opts.referenceDirs?.[lang];
    const root = override ? path.resolve(override) : path.join(dirs.generatedDir, lang);
    const slug = ["reference", lang];
    const hasIndex = existsSync(path.join(root, "index.md")) && statSync(root).isDirectory();
    const meta = hasIndex ? readMeta(path.join(root, "_meta.json")) : null;
    let children: NavNode[];
    if (hasIndex) {
      if (!meta) diagnostics.push({ level: "warning", file: rel(dirs, root), message: "missing or invalid _meta.json" });
      refStatus[lang] = meta?.stub ? "stub" : "present";
      const r = loadDir(root, slug, { realm: "reference", lang, root, dirs, stub: meta?.stub ?? false, diagnostics, pages });
      children = r.children;
    } else {
      refStatus[lang] = "missing";
      const message = `generated API reference not found in ${rel(dirs, root)} (run \`bun run --cwd web docs:generate --only ${lang}\`)`;
      diagnostics.push({ level: strict ? "error" : "warning", file: rel(dirs, root), message });
      const page: DocPage = {
        url: urlOf(slug),
        slug,
        realm: "reference",
        lang,
        title: `${LANG_INFO[lang].label} API reference`,
        description: `Generated API reference for the ${LANG_INFO[lang].label} SDK (${LANG_INFO[lang].pkg}).`,
        order: 0,
        navLabel: "Overview",
        toc: false,
        kind: "index",
        body: placeholderBody(lang),
        bodyLine: 1,
        file: null,
        repoPath: null,
        editUrl: null,
        sourceUrl: null,
        placeholder: true,
        stub: false,
      };
      pages.push(page);
      children = [{ type: "page", url: page.url, label: page.navLabel, order: 0 }];
    }
    refChildren.push({
      type: "section",
      id: urlOf(slug),
      title: LANG_INFO[lang].label,
      order: (i + 1) * 10,
      collapsed: true,
      url: urlOf(slug),
      children,
    });
  });
  const overview: DocPage = {
    url: REFERENCE_PREFIX,
    slug: ["reference"],
    realm: "reference",
    title: "API reference",
    description: "Generated API reference for the JavaScript/TypeScript, .NET, Python, Go and Rust SDKs.",
    order: 0,
    navLabel: "Overview",
    toc: false,
    body: overviewBody(refStatus),
    bodyLine: 1,
    file: null,
    repoPath: null,
    editUrl: null,
    sourceUrl: null,
    placeholder: false,
    stub: false,
  };
  pages.push(overview);
  nav.push({
    type: "section",
    id: REFERENCE_PREFIX,
    title: "API reference",
    order: REFERENCE_SECTION_ORDER,
    collapsed: false,
    url: REFERENCE_PREFIX,
    children: [{ type: "page", url: REFERENCE_PREFIX, label: "Overview", order: 0 }, ...refChildren],
  });

  // Root ordering: the /docs home page first, then sections and pages by order.
  const home = nav.find((n) => n.type === "page" && n.url === DOCS_PREFIX);
  const rest = nav.filter((n) => n !== home).sort(byOrder);
  const finalNav = home ? [home, ...rest] : rest;

  const byUrl = new Map<string, DocPage>();
  const byFile = new Map<string, DocPage>();
  for (const p of pages) {
    const dup = byUrl.get(p.url);
    if (dup) {
      diagnostics.push({
        level: "error",
        file: p.repoPath ?? p.url,
        message: `URL ${p.url} is also produced by ${dup.repoPath ?? "a generated page"}`,
      });
      continue;
    }
    byUrl.set(p.url, p);
    if (p.file) byFile.set(p.file, p);
  }

  const site: DocsSite = { dirs, strict, pages: [...byUrl.values()], byUrl, byFile, nav: finalNav, refStatus, diagnostics };
  if (process.env.NODE_ENV === "production") cache = { key, site };
  return site;
}

export function formatDiagnostics(diags: Diagnostic[]): string {
  return diags.map((d) => `  ${d.level === "error" ? "✖" : "⚠"} ${d.file}: ${d.message}`).join("\n");
}

/** Loads the site and throws if there are any errors (used by the Next.js routes). */
export function getDocsSite(opts: LoadOptions = {}): DocsSite {
  const site = loadDocsSite(opts);
  const errors = site.diagnostics.filter((d) => d.level === "error");
  if (errors.length) throw new Error(`Docs content has ${errors.length} error(s):\n${formatDiagnostics(errors)}`);
  return site;
}

// ---------------------------------------------------------------------------------------------
// Links

export type LinkResolution = { href: string; warning?: string } | { error: string };

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** Normalizes a /docs path: strips a trailing slash, `.md` and `/index`. */
export function normalizeDocsPath(p: string): string {
  let out = p.replace(/\/+$/, "");
  out = out.replace(/\.md$/, "");
  out = out.replace(/\/index$/, "");
  return out || "/";
}

/**
 * Resolves a link written in a page's Markdown to its final href, or explains why it is broken.
 * - external (`https:`, `mailto:` …) and same-page (`#id`) links are kept as is;
 * - `/docs/...` paths must name an existing page (anchors are checked after the build);
 * - relative links must point to a `.md` file in the same tree (`../concepts/targets.md#targets`);
 * - other absolute paths must be one of SITE_PATHS.
 */
export function resolveLink(site: DocsSite, from: DocPage, href: string): LinkResolution {
  const raw = href.trim();
  if (!raw) return { error: "empty link" };
  if (SCHEME_RE.test(raw) || raw.startsWith("//") || raw.startsWith("#")) return { href: raw };
  const m = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(raw)!;
  const p = m[1] ?? "";
  const query = m[2] ?? "";
  const hash = m[3] ?? "";

  if (p.startsWith("/")) {
    if (p === DOCS_PREFIX || p.startsWith(`${DOCS_PREFIX}/`)) {
      const url = normalizeDocsPath(p);
      if (site.byUrl.has(url)) return { href: url + query + hash };
      return missingDocsTarget(site, url, query, hash);
    }
    const sitePath = p.replace(/\/+$/, "") || "/";
    if (SITE_PATHS.has(sitePath)) return { href: sitePath + query + hash };
    return { error: `unknown site path "${p}" (docs links start with /docs/)` };
  }

  // Relative: must be a .md file (or a folder's index via `folder/index.md`).
  if (!from.file) return { error: `relative link "${raw}" in a synthesized page` };
  if (!/\.md$/.test(p)) return { error: `relative link "${raw}" must point to a .md file (or use a /docs/... path)` };
  const abs = path.resolve(path.dirname(from.file), decodeURIComponent(p));
  const target = site.byFile.get(abs);
  if (!target) return { error: `link target "${raw}" does not exist (${rel(site.dirs, abs)})` };
  if (from.realm === "reference" && from.lang && target.lang !== from.lang)
    return { error: `relative link "${raw}" leaves the ${from.lang} reference tree; use a /docs/... path` };
  if (from.realm === "docs" && target.realm !== "docs") return { error: `relative link "${raw}" leaves the docs content tree` };
  return { href: target.url + query + hash };
}

function missingDocsTarget(site: DocsSite, url: string, query: string, hash: string): LinkResolution {
  const m = /^\/docs\/reference\/([a-z]+)(\/.*)?$/.exec(url);
  const lang = m?.[1];
  if (lang && lang in site.refStatus && site.refStatus[lang as RefLang] !== "present") {
    const msg = `links into the ${lang} API reference (${url}), which isn't generated in this build`;
    if (site.strict) return { error: msg };
    return { href: `${REFERENCE_PREFIX}/${lang}${query}`, warning: `${msg}; linking to its index instead` };
  }
  return { error: `no docs page at ${url}${hash}` };
}

// ---------------------------------------------------------------------------------------------
// Navigation helpers

/** Pages in sidebar order. */
export function flattenNav(nodes: NavNode[]): string[] {
  const out: string[] = [];
  const walk = (ns: NavNode[]) => {
    for (const n of ns) {
      if (n.type === "page") {
        if (!out.includes(n.url)) out.push(n.url);
      } else walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Sections containing `url`, outermost first. */
export function ancestorsOf(nodes: NavNode[], url: string): NavSection[] {
  for (const n of nodes) {
    if (n.type === "page") continue;
    if (n.url === url || n.children.some((c) => c.type === "page" && c.url === url)) return [n];
    const inner = ancestorsOf(n.children, url);
    if (inner.length) return [n, ...inner];
  }
  return [];
}

/**
 * Previous/next pages in sidebar order. Hand-written docs link among themselves; each language's
 * reference links only within that language.
 */
export function prevNext(site: DocsSite, page: DocPage): { prev: DocPage | null; next: DocPage | null } {
  const realmKey = (p: DocPage) => (p.realm === "docs" ? "docs" : (p.lang ?? "reference-overview"));
  const order = flattenNav(site.nav)
    .map((u) => site.byUrl.get(u))
    .filter((p): p is DocPage => !!p && realmKey(p) === realmKey(page));
  const i = order.findIndex((p) => p.url === page.url);
  return { prev: i > 0 ? order[i - 1]! : null, next: i >= 0 && i < order.length - 1 ? order[i + 1]! : null };
}
