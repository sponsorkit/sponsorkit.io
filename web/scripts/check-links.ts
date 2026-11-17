#!/usr/bin/env bun
/**
 * Post-build link checker for the static export: every internal <a href> (and every URL in
 * search-index.json) must resolve to a file in web/out, and every #fragment to an id in that file.
 * Assets (<link href>, <script src>, <img src>, including /_next/*) must exist too.
 *
 *   bun run --cwd web docs:check-links [--dir out]
 *
 * Honours BASE_PATH (as used for `next build`). External links and /api/* are skipped,
 * and so are /_next/* <a> links.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
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
const indexFile = path.join(dir, "search-index.json");
const result = checkLinks({
  files,
  html,
  ...(existsSync(indexFile) ? { searchIndex: readFileSync(indexFile, "utf8") } : {}),
  basePath: process.env.BASE_PATH ?? "",
});
for (const b of result.broken) console.error(`✖ ${b.from}: ${b.href} (${b.reason})`);
console.log(`check-links: ${result.checked} internal link(s) in ${result.pages} page(s), ${result.broken.length} broken.`);
process.exit(result.broken.length ? 1 : 0);
