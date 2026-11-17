/** Test helpers: build throwaway web/ trees for the docs loader. Not used at runtime. */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function writeTree(root: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

export const page = (title: string, extra = "", body = "Body.") =>
  `---\ntitle: ${title}\ndescription: About ${title}.\n${extra}---\n\n${body}\n`;
export const section = (title: string, order: number, extra = "") => `---\ntitle: ${title}\norder: ${order}\n${extra}---\n`;

/** A minimal valid web/ folder: returns its path. */
export function makeWeb(files: Record<string, string> = {}): string {
  const repo = mkdtempSync(path.join(tmpdir(), "sk-docs-"));
  const web = path.join(repo, "web");
  writeTree(web, {
    "content/docs/index.md": page("Home", "order: 0\n"),
    ...files,
  });
  return web;
}
