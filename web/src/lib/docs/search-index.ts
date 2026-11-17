import { extractSections } from "./markdown";
import { MAX_TEXT, type SearchEntry, type SearchIndexFile } from "./search-core";
import { type DocsSite, ancestorsOf } from "./site";

const plain = (s: string) =>
  s
    .replace(/:::+\s*[a-z]+(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Builds the search index over every docs page, including the generated API reference. */
export function buildSearchIndex(site: DocsSite): SearchIndexFile {
  const entries: SearchEntry[] = [];
  for (const page of site.pages) {
    const crumbs = [...ancestorsOf(site.nav, page.url).map((s) => s.title), page.title].join(" › ");
    const sections = extractSections(page.body);
    const intro = sections[0]?.id === null ? sections.shift()!.text : "";
    const r = page.realm === "reference" ? ({ r: 1 } as const) : {};
    entries.push({
      u: page.url,
      t: page.title,
      p: page.title,
      c: crumbs,
      x: plain([page.description, page.symbol ?? "", intro].filter(Boolean).join(" ")).slice(0, MAX_TEXT),
      k: "page",
      ...r,
    });
    for (const s of sections) {
      if (!s.id || !s.heading) continue;
      entries.push({ u: `${page.url}#${s.id}`, t: s.heading, p: page.title, c: crumbs, x: plain(s.text).slice(0, MAX_TEXT), k: "section", ...r });
    }
  }
  return { version: 1, entries };
}
