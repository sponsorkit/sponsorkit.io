import { parse as parseYaml } from "yaml";

/** Frontmatter of a hand-written page (web/content/docs/**.md). */
export interface PageFrontmatter {
  title: string;
  description: string;
  /** Sort key within the folder (ascending; ties sort by title). Default 100. */
  order: number;
  /** Shorter label for the sidebar. Defaults to `title`. */
  sidebar_label?: string;
  /** Show the "On this page" table of contents. Default true. */
  toc: boolean;
}

/** Frontmatter of a generated reference page (web/.generated/reference/<lang>/**.md). */
export interface ReferenceFrontmatter extends PageFrontmatter {
  kind?: ReferenceKind;
  /** Fully qualified symbol name, e.g. `Sponsorkit.SponsorkitClient`. Indexed by search. */
  symbol?: string;
  /** Repo-relative source path, optionally with `#L<line>`, e.g. `sdks/js/src/core.ts#L42`. */
  source?: string;
}

/** Frontmatter of a folder's `_section.md`. */
export interface SectionFrontmatter {
  title: string;
  order: number;
  /** Render the sidebar group collapsed unless it contains the current page. Default false. */
  collapsed: boolean;
}

export const REFERENCE_KINDS = [
  "index",
  "package",
  "module",
  "namespace",
  "class",
  "struct",
  "interface",
  "trait",
  "enum",
  "type",
  "function",
  "constant",
  "variable",
  "error",
  "other",
] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const DEFAULT_ORDER = 100;

const PAGE_KEYS = new Set(["title", "description", "order", "sidebar_label", "toc"]);
const REFERENCE_KEYS = new Set([...PAGE_KEYS, "kind", "symbol", "source"]);
const SECTION_KEYS = new Set(["title", "order", "collapsed"]);

export interface SplitResult {
  data: Record<string, unknown>;
  body: string;
  /** 1-based line number where the body starts (for diagnostics). */
  bodyLine: number;
}

/** Splits `---\nyaml\n---\nbody`. Throws on a missing or malformed block. */
export function splitFrontmatter(source: string): SplitResult {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!m) throw new Error("missing YAML frontmatter (the file must start with a `---` block)");
  let data: unknown;
  try {
    data = parseYaml(m[1]!) ?? {};
  } catch (e) {
    throw new Error(`invalid YAML frontmatter: ${(e as Error).message}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("frontmatter must be a YAML mapping");
  return { data: data as Record<string, unknown>, body: text.slice(m[0].length), bodyLine: m[0].split("\n").length };
}

function str(data: Record<string, unknown>, key: string, required: boolean, errors: string[]): string | undefined {
  const v = data[key];
  if (v === undefined || v === null) {
    if (required) errors.push(`\`${key}\` is required`);
    return undefined;
  }
  if (typeof v !== "string" || v.trim() === "") {
    errors.push(`\`${key}\` must be a non-empty string`);
    return undefined;
  }
  return v.trim();
}

function num(data: Record<string, unknown>, key: string, required: boolean, errors: string[]): number | undefined {
  const v = data[key];
  if (v === undefined || v === null) {
    if (required) errors.push(`\`${key}\` is required`);
    return undefined;
  }
  if (typeof v !== "number" || !Number.isFinite(v)) {
    errors.push(`\`${key}\` must be a number`);
    return undefined;
  }
  return v;
}

function bool(data: Record<string, unknown>, key: string, errors: string[]): boolean | undefined {
  const v = data[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") {
    errors.push(`\`${key}\` must be true or false`);
    return undefined;
  }
  return v;
}

function unknownKeys(data: Record<string, unknown>, allowed: Set<string>, errors: string[]) {
  for (const k of Object.keys(data)) if (!allowed.has(k)) errors.push(`unknown frontmatter field \`${k}\``);
}

export class FrontmatterError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("; "));
  }
}

export function parsePageFrontmatter(data: Record<string, unknown>): PageFrontmatter {
  const errors: string[] = [];
  unknownKeys(data, PAGE_KEYS, errors);
  const fm = commonPage(data, errors);
  if (errors.length) throw new FrontmatterError(errors);
  return fm;
}

function commonPage(data: Record<string, unknown>, errors: string[]): PageFrontmatter {
  const title = str(data, "title", true, errors) ?? "";
  const description = str(data, "description", true, errors) ?? "";
  const order = num(data, "order", false, errors) ?? DEFAULT_ORDER;
  const sidebar_label = str(data, "sidebar_label", false, errors);
  const toc = bool(data, "toc", errors) ?? true;
  return { title, description, order, toc, ...(sidebar_label ? { sidebar_label } : {}) };
}

export function parseReferenceFrontmatter(data: Record<string, unknown>): ReferenceFrontmatter {
  const errors: string[] = [];
  unknownKeys(data, REFERENCE_KEYS, errors);
  const fm: ReferenceFrontmatter = commonPage(data, errors);
  const kind = str(data, "kind", false, errors);
  if (kind !== undefined) {
    if ((REFERENCE_KINDS as readonly string[]).includes(kind)) fm.kind = kind as ReferenceKind;
    else errors.push(`\`kind\` must be one of ${REFERENCE_KINDS.join(", ")}`);
  }
  const symbol = str(data, "symbol", false, errors);
  if (symbol) fm.symbol = symbol;
  const source = str(data, "source", false, errors);
  if (source !== undefined) {
    if (/^(?:[a-z]+:|\/|\.\.?\/)/i.test(source)) errors.push("`source` must be a repo-relative path such as `sdks/js/src/core.ts#L42`");
    else fm.source = source;
  }
  if (errors.length) throw new FrontmatterError(errors);
  return fm;
}

export function parseSectionFrontmatter(data: Record<string, unknown>): SectionFrontmatter {
  const errors: string[] = [];
  unknownKeys(data, SECTION_KEYS, errors);
  const title = str(data, "title", true, errors) ?? "";
  const order = num(data, "order", true, errors) ?? DEFAULT_ORDER;
  const collapsed = bool(data, "collapsed", errors) ?? false;
  if (errors.length) throw new FrontmatterError(errors);
  return { title, order, collapsed };
}
