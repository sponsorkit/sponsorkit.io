/**
 * Dependency-free client search over the build-time index (/search-index.json). Shared by the
 * index builder, the search dialog and the tests.
 */

export interface SearchEntry {
  /** URL including the section anchor, e.g. `/docs/concepts/targets#target-sets`. */
  u: string;
  /** Title: the page title for page entries, the heading text for section entries. */
  t: string;
  /** Page title. */
  p: string;
  /** Breadcrumb, e.g. `Concepts › Targets`. */
  c: string;
  /** Plain text (truncated). */
  x: string;
  k: "page" | "section";
  /** 1 for generated API reference entries. */
  r?: 1;
}

export interface SearchIndexFile {
  version: 1;
  entries: SearchEntry[];
}

export const MAX_TEXT = 1500;

/** Lowercased word tokens; camelCase/PascalCase/snake_case identifiers also yield their parts. */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  for (const word of input.split(/[^\p{L}\p{N}_]+/u)) {
    if (!word) continue;
    const lower = word.toLowerCase();
    out.push(lower);
    const parts = word
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .split(/[\s_]+/)
      .filter(Boolean);
    if (parts.length > 1) for (const p of parts) out.push(p.toLowerCase());
  }
  return out;
}

export interface PreparedEntry {
  entry: SearchEntry;
  title: string[];
  page: string[];
  crumbs: string[];
  text: string[];
  titleLower: string;
  /** Hand-written pages only: URL path segment tokens (e.g. `guides`, `mock`, `mode`). */
  slug: string[];
  /** Hand-written pages only: the last URL path segment, e.g. `mock-mode`. */
  lastSegment: string;
  /** Hand-written page entries only: tokens of the description (the start of the text). */
  lead: string[];
  /** Number of URL path segments after /docs (shallower pages win ties). */
  depth: number;
}

/** Lowercase, with every run of non-alphanumerics collapsed to one space. */
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Score multiplier for generated API reference entries, so guides outrank same-named symbols. */
export const REFERENCE_WEIGHT = 0.5;

export function prepare(entries: SearchEntry[]): PreparedEntry[] {
  return entries.map((entry) => {
    const guide = !entry.r;
    const all = entry.u.split("#")[0]!.split("/").filter((x) => x && x !== "docs");
    const segments = guide ? all : [];
    return {
      entry,
      title: tokenize(entry.t),
      page: tokenize(entry.p),
      crumbs: tokenize(entry.c),
      text: [...new Set(tokenize(entry.x))],
      titleLower: normalize(entry.t),
      slug: guide && entry.k === "page" ? segments.flatMap((x) => x.split("-")) : [],
      lastSegment: guide && entry.k === "page" ? (segments.at(-1) ?? "") : "",
      lead: guide && entry.k === "page" ? [...new Set(tokenize(entry.x.slice(0, 300)))] : [],
      depth: all.length,
    };
  });
}

function best(tokens: string[], term: string, exact: number, prefix: number): number {
  let score = 0;
  for (const t of tokens) {
    if (t === term) return exact;
    if (prefix > score && t.startsWith(term)) score = prefix;
  }
  return score;
}

/**
 * Returns matching entries, best first. Every query term must match (as a word prefix).
 * Hand-written pages also match on their URL slug and description, and generated reference
 * entries are down-weighted, so `nag` finds the nag guide before the `Nag` symbols.
 */
export function search(prepared: PreparedEntry[], query: string, limit = 20): SearchEntry[] {
  const terms = [...new Set(tokenize(query).filter((t) => t.length > 0))];
  if (terms.length === 0) return [];
  const q = normalize(query);
  const qSlug = q.replace(/ /g, "-");
  const scored: { e: PreparedEntry; s: number }[] = [];
  for (const e of prepared) {
    let total = 0;
    let ok = true;
    for (const term of terms) {
      const s = Math.max(
        best(e.title, term, 12, 8),
        best(e.slug, term, 10, 7),
        best(e.page, term, 5, 3),
        best(e.lead, term, 4, 3),
        best(e.crumbs, term, 2, 1),
        best(e.text, term, 2, 1),
      );
      if (s === 0) {
        ok = false;
        break;
      }
      total += s;
    }
    if (!ok) continue;
    if (e.titleLower === q || (qSlug && e.lastSegment === qSlug)) total += 20;
    else if (e.titleLower.includes(q) || (qSlug && e.lastSegment.startsWith(qSlug))) total += 8;
    if (e.entry.k === "page") total += e.entry.r ? 2 : 4;
    if (e.entry.r) total *= REFERENCE_WEIGHT;
    scored.push({ e, s: total });
  }
  scored.sort(
    (a, b) =>
      b.s - a.s ||
      a.e.depth - b.e.depth ||
      (a.e.entry.k === "page" ? 0 : 1) - (b.e.entry.k === "page" ? 0 : 1) ||
      a.e.entry.t.length - b.e.entry.t.length ||
      a.e.entry.u.localeCompare(b.e.entry.u),
  );
  return scored.slice(0, limit).map((x) => x.e.entry);
}

/** A short excerpt of `text` around the first query term. */
export function snippet(text: string, query: string, length = 140): string {
  if (text.length <= length) return text;
  const lower = text.toLowerCase();
  let at = -1;
  for (const term of tokenize(query)) {
    const i = lower.indexOf(term);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return `${text.slice(0, length).trimEnd()}…`;
  const start = Math.max(0, at - 40);
  const out = text.slice(start, start + length).trim();
  return `${start > 0 ? "…" : ""}${out}${start + length < text.length ? "…" : ""}`;
}
