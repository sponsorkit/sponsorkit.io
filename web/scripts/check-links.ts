#!/usr/bin/env bun
/**
 * Post-build link checker for the static export: every internal <a href> (and every URL in
 * search-index.json) must resolve to a file in web/out, and every #fragment to an id in that file.
 * Assets (<link href>, <script src>, <img src>, including /_next/*) must exist too.
 *
 *   bun run --cwd web docs:check-links [--dir out]
 *
 * Uses the same BASE_PATH and SITE_URL as `next build` (web/site-config.ts: /sponsorkit.io and
 * https://sponsorkit.github.io/sponsorkit.io by default). Absolute links under SITE_URL (canonical,
 * og:url, sitemap.xml) are checked too. Other external links and /api/* are skipped, and so are
 * /_next/* <a> links.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { siteConfig } from "../site-config";
import { checkLinks } from "../src/lib/docs/link-check";

const args = process.argv.slice(2);
const i = args.indexOf("--dir");
const dir = path.resolve(i >= 0 && args[i + 1] ? args[i + 1]! : "out");
if (!existsSync(dir)) {
  console.error(`${dir} does not exist; run \`bun run build\` first`);
  process.exit(2);
}
const files = new Set<string>();
const html = new Map<string, string>();
const walk = (d: string) => {
  for (const e of readdirSync(d)) {
    const abs = path.join(d, e);
    if (statSync(abs).isDirectory()) walk(abs);
    else {
      const rel = path.relative(dir, abs).split(path.sep).join("/");
      files.add(rel);
      if (rel.endsWith(".html")) html.set(rel, readFileSync(abs, "utf8"));
    }
  }
};
walk(dir);
const site = siteConfig();
const indexFile = path.join(dir, "search-index.json");
const sitemapFile = path.join(dir, "sitemap.xml");
const missing = [".nojekyll", "robots.txt", "sitemap.xml", "404.html"].filter((f) => !files.has(f));
for (const f of missing) console.error(`✖ ${f} is missing from the export (GitHub Pages needs it)`);
const result = checkLinks({
  files,
  html,
  ...(existsSync(indexFile) ? { searchIndex: readFileSync(indexFile, "utf8") } : {}),
  ...(existsSync(sitemapFile) ? { sitemap: readFileSync(sitemapFile, "utf8") } : {}),
  basePath: site.basePath,
  siteUrl: site.siteUrl,
});
for (const b of result.broken) console.error(`✖ ${b.from}: ${b.href} (${b.reason})`);
console.log(
  `check-links: ${result.checked} internal link(s) in ${result.pages} page(s) under ${site.siteUrl}, ${result.broken.length} broken.`,
);
process.exit(result.broken.length || missing.length ? 1 : 0);
