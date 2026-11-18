/**
 * The suite must start on a clean checkout (`bun install` at the repo root), not only where a global
 * NODE_PATH happens to provide playwright / wrangler. Regression test for that.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { REPO_ROOT } from "../lib/config.mjs";

const read = (p) => JSON.parse(readFileSync(path.join(REPO_ROOT, p), "utf8"));

test("e2e declares its own dependencies", () => {
  const pkg = read("e2e/package.json");
  const web = read("web/package.json");
  // Same Playwright as web/, so one browser download serves both.
  assert.equal(pkg.devDependencies?.playwright, web.devDependencies?.["@playwright/test"] ?? web.dependencies?.["@playwright/test"]);
  assert.ok(pkg.devDependencies?.wrangler, "wrangler devDependency");
});

test("playwright resolves from the repo, not from a global NODE_PATH", () => {
  const resolved = createRequire(path.join(REPO_ROOT, "e2e", "test", "x.mjs")).resolve("playwright");
  const lookup = createRequire(path.join(REPO_ROOT, "e2e", "test", "x.mjs")).resolve.paths("playwright") ?? [];
  const nodePath = (process.env.NODE_PATH ?? "").split(path.delimiter).filter(Boolean);
  assert.ok(
    resolved.startsWith(REPO_ROOT + path.sep),
    `playwright resolved outside the repo (${resolved}); run \`bun install\` at the repo root (e2e must be a workspace). Lookup paths: ${lookup.filter((p) => !nodePath.includes(p)).join(", ")}`,
  );
});
