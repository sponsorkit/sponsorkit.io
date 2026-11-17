/**
 * Build-time Markdown pipeline: remark (GFM + directives) → Sponsorkit transforms → rehype
 * (headings, tables, Shiki) → hast. Rendered to React by src/components/docs/markdown.tsx.
 *
 * Extensions (see web/content/docs/CONTRIBUTING-DOCS.md):
 * - `:::note` / `:::tip` / `:::warning` / `:::danger` callouts (optional `[Title]`), and GitHub
 *   alerts (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`);
 * - `:::tabs{group="lang"}` containing fenced code blocks or `:::tab[Label]{key="js"}` containers;
 * - heading ids (GitHub slugs, or an explicit `{#id}` suffix);
 * - links resolved/validated through a caller-supplied resolver.
 */
import GithubSlugger from "github-slugger";
import type { Element, ElementContent, Root as HastRoot } from "hast";
import { toString as hastToString } from "hast-util-to-string";
import type { Blockquote, Heading, Nodes, Paragraph, Parent, PhrasingContent, Root, RootContent } from "mdast";
import { toString as mdToString } from "mdast-util-to-string";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { bundledLanguages, codeToHast } from "shiki";
import { unified } from "unified";
import { LANG_INFO } from "./config";
import type { LinkResolution } from "./site";

export interface TocHeading {
  depth: 2 | 3;
  id: string;
  text: string;
}

export interface MarkdownDiagnostic {
  level: "error" | "warning";
  line?: number;
  message: string;
}

export interface CompileOptions {
  /** Resolves every link/definition URL. Defaults to keeping links unchanged. */
  resolveLink?: (href: string) => LinkResolution;
  /** Highlight code with Shiki (default true). */
  highlight?: boolean;
}

export interface CompiledMarkdown {
  hast: HastRoot;
  /** h2/h3 headings for the "On this page" list. */
  toc: TocHeading[];
  /** Every heading id on the page (h2–h6). */
  ids: string[];
  diagnostics: MarkdownDiagnostic[];
}

export const CALLOUT_TYPES = ["note", "tip", "warning", "danger"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];
const CALLOUT_TITLES: Record<CalloutType, string> = { note: "Note", tip: "Tip", warning: "Warning", danger: "Danger" };
const GH_ALERTS: Record<string, CalloutType> = { NOTE: "note", TIP: "tip", IMPORTANT: "note", WARNING: "warning", CAUTION: "danger" };

/** Default tab-sync group; readers' choice in this group is remembered site-wide. */
export const DEFAULT_TAB_GROUP = "lang";

/** Short tab labels for the SDK languages. */
export const TAB_LABELS: Record<string, string> = { js: "JavaScript", dotnet: ".NET", python: "Python", go: "Go", rust: "Rust" };

/** Code-fence language → canonical tab key (the SDK language ids). */
const LANG_TO_KEY: Record<string, string> = {
  js: "js",
  jsx: "js",
  ts: "js",
  tsx: "js",
  mjs: "js",
  cjs: "js",
  javascript: "js",
  typescript: "js",
  cs: "dotnet",
  csharp: "dotnet",
  "c#": "dotnet",
  fs: "dotnet",
  fsharp: "dotnet",
  py: "python",
  python: "python",
  go: "go",
  golang: "go",
  rs: "rust",
  rust: "rust",
};

/** Canonical tab key for a code-fence language (`ts` → `js`, `csharp` → `dotnet` …). */
export function tabKeyForLang(lang: string | null | undefined): string | null {
  if (!lang) return null;
  return LANG_TO_KEY[lang.toLowerCase()] ?? lang.toLowerCase();
}

/** Parses `title="app.ts" tab="Node" key=js` from a code fence's meta string. */
export function parseMeta(meta: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!meta) return out;
  for (const m of meta.matchAll(/([A-Za-z][\w-]*)=(?:"([^"]*)"|'([^']*)'|(\S+))/g)) out[m[1]!] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

const EXPLICIT_ID_RE = /\s*\{#([a-z0-9]+(?:[-_][a-z0-9]+)*)\}\s*$/;

/**
 * Strips an explicit `{#id}` suffix from a heading (mutating it) and returns its id: the explicit
 * one, or a GitHub-style slug made unique by `slugger`.
 */
export function headingId(node: Heading, slugger: GithubSlugger): { id: string; explicit: boolean } {
  const last = node.children[node.children.length - 1];
  if (last?.type === "text") {
    const m = EXPLICIT_ID_RE.exec(last.value);
    if (m) {
      last.value = last.value.slice(0, m.index);
      if (!last.value) node.children.pop();
      // Reserve it so a later identical heading gets a suffix.
      slugger.occurrences[m[1]!] = (slugger.occurrences[m[1]!] ?? 0) + 1;
      return { id: m[1]!, explicit: true };
    }
  }
  return { id: slugger.slug(mdToString(node)), explicit: false };
}

// ---------------------------------------------------------------------------------------------
// mdast

interface DirectiveNode extends Parent {
  type: "containerDirective" | "leafDirective" | "textDirective";
  name: string;
  attributes?: Record<string, string | null | undefined> | null;
  children: RootContent[];
  data?: Record<string, unknown>;
}

type Diag = (level: "error" | "warning", node: Nodes | undefined, message: string) => void;

function isDirective(n: Nodes): n is Nodes & DirectiveNode {
  return n.type === "containerDirective" || n.type === "leafDirective" || n.type === "textDirective";
}

/** Splits off a directive's `[label]` paragraph. */
function takeLabel(node: DirectiveNode): string | null {
  const first = node.children[0] as Paragraph | undefined;
  if (first?.type === "paragraph" && (first.data as { directiveLabel?: boolean } | undefined)?.directiveLabel) {
    node.children.shift();
    return mdToString(first).trim() || null;
  }
  return null;
}

function hdata(node: { data?: unknown }, hName: string, hProperties: Record<string, unknown>) {
  node.data = { ...((node.data as object) ?? {}), hName, hProperties };
}

function callout(node: Parent, type: CalloutType, title: string | null) {
  const titleNode: Paragraph = { type: "paragraph", children: [{ type: "text", value: title ?? CALLOUT_TITLES[type] }] };
  hdata(titleNode, "p", { className: ["callout-title"] });
  node.children.unshift(titleNode as never);
  hdata(node, "div", { className: ["callout", `callout-${type}`], role: "note" });
}

function transformTabs(node: DirectiveNode, diag: Diag) {
  const label = takeLabel(node);
  if (label) diag("warning", node as Nodes, ":::tabs ignores its [label]");
  const group = (node.attributes?.group ?? DEFAULT_TAB_GROUP) || DEFAULT_TAB_GROUP;
  if (!/^[a-z0-9-]+$/.test(group)) diag("error", node as Nodes, `tab group "${group}" must be lowercase letters, digits or dashes`);
  const tabs: { key: string; label: string }[] = [];
  const newChildren: RootContent[] = [];
  for (const child of node.children) {
    let key: string | null = null;
    let tabLabel: string | null = null;
    let wrapper: DirectiveNode;
    if (child.type === "code") {
      const meta = parseMeta(child.meta);
      key = meta.key ?? tabKeyForLang(child.lang);
      tabLabel = meta.tab ?? (key && TAB_LABELS[key]) ?? meta.title ?? child.lang ?? null;
      wrapper = { type: "containerDirective", name: "tab", attributes: {}, children: [child], ...(child.position ? { position: child.position } : {}) };
    } else if (isDirective(child) && child.type === "containerDirective" && child.name === "tab") {
      wrapper = child;
      tabLabel = takeLabel(child) ?? child.attributes?.label ?? null;
      key = child.attributes?.key ?? null;
      if (!key && tabLabel) {
        const known = Object.entries(TAB_LABELS).find(([, l]) => l.toLowerCase() === tabLabel!.toLowerCase());
        const lang = Object.entries(LANG_INFO).find(([, l]) => l.label.toLowerCase() === tabLabel!.toLowerCase());
        key = known?.[0] ?? lang?.[0] ?? tabLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      }
      // Nested content may itself contain directives (callouts, code).
    } else {
      diag("error", child as Nodes, `only fenced code blocks or :::tab containers may appear inside :::tabs (found ${child.type})`);
      continue;
    }
    if (!key || !tabLabel) {
      diag("error", child as Nodes, 'tab needs a label: add tab="Label" (code fences) or :::tab[Label]');
      continue;
    }
    if (tabs.some((t) => t.key === key)) {
      diag("error", child as Nodes, `duplicate tab key "${key}" in this :::tabs (set key="..." to tell them apart)`);
      continue;
    }
    hdata(wrapper, "sk-tab", { dataKey: key, dataLabel: tabLabel });
    tabs.push({ key, label: tabLabel });
    newChildren.push(wrapper as RootContent);
  }
  if (tabs.length === 0) diag("error", node as Nodes, ":::tabs has no tabs");
  node.children = newChildren;
  hdata(node, "sk-tabs", { dataGroup: group, dataTabs: JSON.stringify(tabs) });
}

function directiveToText(node: DirectiveNode): PhrasingContent[] {
  const prefix = node.type === "textDirective" ? ":" : "::";
  const out: PhrasingContent[] = [{ type: "text", value: prefix + node.name }];
  if (node.children.length) {
    out.push({ type: "text", value: "[" });
    out.push(...(node.children as PhrasingContent[]));
    out.push({ type: "text", value: "]" });
  }
  return out;
}

function transformMdast(tree: Root, opts: CompileOptions, diag: Diag, toc: TocHeading[], ids: string[]) {
  const slugger = new GithubSlugger();

  const resolve = (url: string, node: Nodes): string => {
    if (!opts.resolveLink) return url;
    const r = opts.resolveLink(url);
    if ("error" in r) {
      diag("error", node, `broken link: ${r.error}`);
      return url;
    }
    if (r.warning) diag("warning", node, r.warning);
    return r.href;
  };

  const walk = (parent: Parent, inTabs: boolean, parentIsTabs = false) => {
    for (let i = 0; i < parent.children.length; i++) {
      const node = parent.children[i] as Nodes;
      switch (node.type) {
        case "heading": {
          if (node.depth === 1) diag("error", node, "don't use `#` headings in the body; the page title comes from frontmatter");
          const { id } = headingId(node, slugger);
          if (/\{#[^}]*\}\s*$/.test(mdToString(node)))
            diag("error", node, "invalid explicit heading id: use {#lowercase-id} (letters, digits, - and _)");
          if (ids.includes(id)) diag("error", node, `duplicate heading id "${id}"`);
          ids.push(id);
          hdata(node, `h${node.depth}`, { id });
          if (node.depth === 2 || node.depth === 3) toc.push({ depth: node.depth, id, text: mdToString(node) });
          break;
        }
        case "link":
        case "definition":
          node.url = resolve(node.url, node);
          break;
        case "blockquote":
          githubAlert(node);
          break;
        case "html":
          if (!/^<!--[\s\S]*-->$/.test(node.value.trim())) diag("warning", node, "raw HTML is not rendered; use Markdown or a directive");
          break;
        default:
          if (isDirective(node)) {
            if (node.type !== "containerDirective") {
              // `:name` in prose (e.g. "github:octocat") isn't a directive we know; put the text back.
              const replacement = directiveToText(node);
              if (node.type === "leafDirective") {
                parent.children[i] = { type: "paragraph", children: replacement } as never;
              } else {
                parent.children.splice(i, 1, ...(replacement as never[]));
                i += replacement.length - 1;
              }
              continue;
            }
            if ((CALLOUT_TYPES as readonly string[]).includes(node.name)) {
              callout(node, node.name as CalloutType, takeLabel(node));
            } else if (node.name === "tabs") {
              if (inTabs) diag("error", node as Nodes, ":::tabs cannot be nested");
              transformTabs(node, diag);
              walk(node, true, true);
              continue;
            } else if (node.name === "tab") {
              if (!parentIsTabs) diag("error", node as Nodes, ":::tab must be directly inside :::tabs");
            } else {
              diag("error", node as Nodes, `unknown directive ":::${node.name}" (known: ${[...CALLOUT_TYPES, "tabs", "tab"].join(", ")})`);
              hdata(node, "div", {});
            }
          }
      }
      if ("children" in node && Array.isArray(node.children)) walk(node as Parent, inTabs);
    }
  };
  walk(tree, false);
}

function githubAlert(node: Blockquote) {
  const first = node.children[0];
  if (first?.type !== "paragraph") return;
  const text = first.children[0];
  if (text?.type !== "text") return;
  const m = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/.exec(text.value);
  if (!m) return;
  text.value = text.value.slice(m[0].length);
  if (!text.value) first.children.shift();
  if (first.children.length === 0) node.children.shift();
  callout(node, GH_ALERTS[m[1]!]!, null);
}

// ---------------------------------------------------------------------------------------------
// hast

const el = (tagName: string, properties: Element["properties"], children: ElementContent[] = []): Element => ({
  type: "element",
  tagName,
  properties,
  children,
});

async function highlightCode(code: string, lang: string | null): Promise<Element> {
  const resolved = lang && lang in bundledLanguages ? lang : null;
  if (!resolved) return el("pre", { tabIndex: 0 }, [el("code", {}, [{ type: "text", value: code }])]);
  const root = await codeToHast(code, {
    lang: resolved,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: "light",
  });
  const pre = root.children.find((c): c is Element => c.type === "element" && c.tagName === "pre");
  return pre ?? el("pre", { tabIndex: 0 }, [el("code", {}, [{ type: "text", value: code }])]);
}

function rehypeTransform(tree: HastRoot, opts: CompileOptions, diag: Diag): Promise<void>[] {
  const jobs: Promise<void>[] = [];
  const walk = (parent: HastRoot | Element) => {
    parent.children.forEach((node, i) => {
      if (node.type !== "element") return;
      const tag = node.tagName;
      if (/^h[2-6]$/.test(tag) && typeof node.properties.id === "string") {
        const id = node.properties.id;
        node.children = [
          ...node.children,
          el("a", { className: ["anchor"], href: `#${id}`, ariaLabel: `Link to section: ${hastToString(node)}` }, [
            { type: "text", value: "#" },
          ]),
        ];
        return;
      }
      if (tag === "table") {
        parent.children[i] = el("div", { className: ["table-wrap"], tabIndex: 0, role: "region", ariaLabel: "Table" }, [node]);
        return;
      }
      if (tag === "pre") {
        const code = node.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
        if (code) {
          const classes = (code.properties.className as string[] | undefined) ?? [];
          const lang = classes.find((c) => c.startsWith("language-"))?.slice("language-".length) ?? null;
          const meta = parseMeta((code.data as { meta?: string } | undefined)?.meta);
          const source = hastToString(code).replace(/\n$/, "");
          if (lang && !(lang in bundledLanguages) && !["text", "txt", "plain"].includes(lang))
            diag("warning", undefined, `unknown code language "${lang}" (rendered as plain text)`);
          const figure = el("figure", { className: ["code"], dataLang: lang ?? "text" }, []);
          parent.children[i] = figure;
          const job = (opts.highlight === false ? Promise.resolve(el("pre", { tabIndex: 0 }, [code])) : highlightCode(source, lang)).then(
            (pre) => {
              const copy = el("sk-copy", {}, []);
              figure.children = meta.title
                ? [el("figcaption", { className: ["code-title"] }, [el("span", {}, [{ type: "text", value: meta.title }]), copy]), pre]
                : [el("div", { className: ["code-toolbar"] }, [copy]), pre];
            },
          );
          jobs.push(job);
          return;
        }
      }
      walk(node);
    });
  };
  walk(tree);
  return jobs;
}

// ---------------------------------------------------------------------------------------------

function parser() {
  return unified().use(remarkParse).use(remarkGfm).use(remarkDirective);
}

/** Compiles a page body (Markdown without frontmatter) to hast. Never throws on content errors. */
export async function compileMarkdown(body: string, opts: CompileOptions = {}): Promise<CompiledMarkdown> {
  const diagnostics: MarkdownDiagnostic[] = [];
  const diag: Diag = (level, node, message) =>
    diagnostics.push({ level, message, ...(node?.position ? { line: node.position.start.line } : {}) });
  const toc: TocHeading[] = [];
  const ids: string[] = [];
  const proc = parser();
  const mdast = proc.parse(body) as Root;
  transformMdast(mdast, opts, diag, toc, ids);
  const hast = (await unified().use(remarkRehype).run(mdast as never)) as HastRoot;
  await Promise.all(rehypeTransform(hast, opts, diag));
  return { hast, toc, ids, diagnostics };
}

export interface TextSection {
  /** Heading id, or null for the text before the first heading. */
  id: string | null;
  heading: string | null;
  depth: number;
  text: string;
}

/**
 * Splits a page body into searchable sections (at h2/h3), with the same heading ids the renderer
 * produces. Directive labels and code are kept as plain text.
 */
export function extractSections(body: string): TextSection[] {
  const tree = parser().parse(body) as Root;
  const slugger = new GithubSlugger();
  const sections: TextSection[] = [{ id: null, heading: null, depth: 1, text: "" }];
  const push = (t: string) => {
    const s = sections[sections.length - 1]!;
    s.text = s.text ? `${s.text} ${t}` : t;
  };
  const visitAll = (nodes: RootContent[]) => {
    for (const n of nodes) {
      if (n.type === "heading") {
        const { id } = headingId(n, slugger);
        const text = mdToString(n);
        if (n.depth === 2 || n.depth === 3) sections.push({ id, heading: text, depth: n.depth, text: "" });
        else push(text);
      } else if (n.type === "code") push(n.value);
      else if (n.type === "html") continue;
      else if ("children" in n && n.type !== "paragraph" && n.type !== "tableCell") visitAll(n.children as RootContent[]);
      else push(mdToString(n as Nodes));
    }
  };
  visitAll(tree.children);
  return sections
    .map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ").trim() }))
    .filter((s) => s.heading !== null || s.text !== "");
}
