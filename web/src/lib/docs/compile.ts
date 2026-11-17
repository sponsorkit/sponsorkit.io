import { type CompiledMarkdown, compileMarkdown } from "./markdown";
import { type DocPage, type DocsSite, resolveLink } from "./site";

/** Compiles one page; throws (failing the build) on broken links or invalid Markdown extensions. */
export async function compilePage(site: DocsSite, page: DocPage): Promise<CompiledMarkdown> {
  const out = await compileMarkdown(page.body, { resolveLink: (href) => resolveLink(site, page, href) });
  const where = (line?: number) => `${page.repoPath ?? page.url}${line ? `:${line + bodyOffset(page)}` : ""}`;
  for (const d of out.diagnostics.filter((x) => x.level === "warning")) console.warn(`⚠ docs: ${where(d.line)}: ${d.message}`);
  const errors = out.diagnostics.filter((d) => d.level === "error");
  if (errors.length) throw new Error(`Docs page has ${errors.length} error(s):\n${errors.map((d) => `  ✖ ${where(d.line)}: ${d.message}`).join("\n")}`);
  return out;
}

function bodyOffset(page: DocPage): number {
  if (!page.file) return 0;
  // Frontmatter lines precede the body; diagnostics report lines in the file.
  return page.bodyLine - 1;
}
