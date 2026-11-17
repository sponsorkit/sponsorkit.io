/**
 * Validates one language's generated API reference against web/content/docs/REFERENCE-CONTRACT.md
 * without running `next build`. Used by scripts/validate-generated.ts and scripts/docs-generate.ts.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { type RefLang, docsDirs } from "./config";
import { compileMarkdown } from "./markdown";
import { type DocPage, loadDocsSite, resolveLink } from "./site";

export interface ValidationResult {
  lang: RefLang;
  dir: string;
  pages: number;
  stub: boolean;
  errors: string[];
  warnings: string[];
}

const META_KEYS = new Set(["lang", "package", "version", "generator", "stub", "generatedAt"]);

export async function validateReference(lang: RefLang, dir: string, opts: { webDir?: string } = {}): Promise<ValidationResult> {
  const abs = path.resolve(dir);
  const res: ValidationResult = { lang, dir: abs, pages: 0, stub: false, errors: [], warnings: [] };
  const err = (m: string) => res.errors.push(m);
  const warn = (m: string) => res.warnings.push(m);

  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    err(`output folder ${abs} does not exist`);
    return res;
  }
  if (!existsSync(path.join(abs, "index.md"))) err("index.md is missing");

  // _meta.json
  const metaFile = path.join(abs, "_meta.json");
  if (!existsSync(metaFile)) err("_meta.json is missing");
  else {
    try {
      const meta = JSON.parse(readFileSync(metaFile, "utf8")) as Record<string, unknown>;
      if (typeof meta !== "object" || meta === null || Array.isArray(meta)) throw new Error("not an object");
      if (meta.lang !== lang) err(`_meta.json: "lang" must be "${lang}"`);
      if (typeof meta.generator !== "string" || !meta.generator) err('_meta.json: "generator" must be a non-empty string');
      for (const k of ["package", "version", "generatedAt"])
        if (meta[k] !== undefined && typeof meta[k] !== "string") err(`_meta.json: "${k}" must be a string`);
      if (meta.stub !== undefined && typeof meta.stub !== "boolean") err('_meta.json: "stub" must be a boolean');
      res.stub = meta.stub === true;
      for (const k of Object.keys(meta)) if (!META_KEYS.has(k)) warn(`_meta.json: unknown field "${k}"`);
    } catch (e) {
      err(`_meta.json is not valid JSON: ${(e as Error).message}`);
    }
  }
  if (res.errors.length) return res;
  if (res.stub) warn("output is marked as a stub (_meta.json \"stub\": true)");

  const site = loadDocsSite({ ...opts, strict: false, referenceDirs: { [lang]: abs } });
  const dirs = docsDirs(opts.webDir);
  const relAbs = path.relative(dirs.repoDir, abs).split(path.sep).join("/");
  for (const d of site.diagnostics) {
    if (!d.file.startsWith(relAbs)) continue;
    (d.level === "error" ? err : warn)(`${d.file}: ${d.message}`);
  }

  const pages = site.pages.filter((p) => p.lang === lang && p.realm === "reference" && p.file);
  res.pages = pages.length;

  // Heading ids per page, computed lazily.
  const idCache = new Map<string, Promise<Set<string>>>();
  const idsOf = (page: DocPage) => {
    let p = idCache.get(page.url);
    if (!p) {
      p = compileMarkdown(page.body, { highlight: false }).then((c) => new Set(c.ids));
      idCache.set(page.url, p);
    }
    return p;
  };

  for (const page of pages) {
    const where = page.repoPath ?? page.url;
    const links: string[] = [];
    const compiled = await compileMarkdown(page.body, {
      highlight: false,
      resolveLink: (href) => {
        const r = resolveLink(site, page, href);
        if (!("error" in r)) links.push(r.href);
        return r;
      },
    });
    for (const d of compiled.diagnostics) {
      const line = d.line ? `:${d.line + page.bodyLine - 1}` : "";
      (d.level === "error" ? err : warn)(`${where}${line}: ${d.message}`);
    }
    const meaningful = page.body.replace(/<!--[\s\S]*?-->/g, "").trim();
    if (!meaningful) err(`${where}: page is empty`);
    if (page.slug.length === 2 && page.kind !== "index") warn(`${where}: index.md should have \`kind: index\``);
    if (page.sourceUrl) {
      const src = page.sourceUrl.replace(/^.*?\/blob\/main\//, "").replace(/#.*$/, "");
      if (!existsSync(path.join(dirs.repoDir, src))) warn(`${where}: source file ${src} does not exist`);
    }
    for (const href of links) {
      const m = /^(\/docs[^?#]*)(?:\?[^#]*)?#(.+)$/.exec(href);
      if (!m) continue;
      const target = site.byUrl.get(m[1]!);
      if (!target) continue;
      const ids = await idsOf(target);
      const id = decodeURIComponent(m[2]!);
      if (!ids.has(id)) err(`${where}: link ${href} points to a missing anchor #${id}`);
    }
  }
  return res;
}

export function formatValidation(r: ValidationResult): string {
  const lines = [`${r.lang}: ${r.pages} page(s) in ${r.dir}${r.stub ? " (stub)" : ""}`];
  for (const e of r.errors) lines.push(`  ✖ ${e}`);
  for (const w of r.warnings) lines.push(`  ⚠ ${w}`);
  lines.push(r.errors.length ? `  ${r.errors.length} error(s)` : "  OK");
  return lines.join("\n");
}

