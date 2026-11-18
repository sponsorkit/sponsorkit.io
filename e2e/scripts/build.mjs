#!/usr/bin/env node
/**
 * Builds what the e2e test serves:
 *  1. the JS SDK (sdks/js → sdks/js/dist, `tsup`);
 *  2. the site (web/ static export) for the local split deployment:
 *       BASE_PATH=/sponsorkit.io TRAILING_SLASH=1 SITE_URL=<local site base URL>
 *       NEXT_PUBLIC_SPONSORKIT_API_BASE=<local API origin>
 *     The export is moved to e2e/.cache/site, and any existing web/out is put back afterwards, so
 *     the developer's own build is left as it was.
 *
 * Env: E2E_SKIP_BUILD=1 skips both steps when their outputs exist (and the site was built for the
 * same URLs); E2E_SKIP_SDK_BUILD=1 / E2E_SKIP_SITE_BUILD=1 skip one step.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { API_ORIGIN, BASE_PATH, CACHE_DIR, REPO_ROOT, SDK_DIST_DIR, SITE_BASE_URL, SITE_DIR } from "../lib/config.mjs";

const skipAll = process.env.E2E_SKIP_BUILD === "1";
const stampFile = path.join(CACHE_DIR, "site-build.json");
const stamp = { BASE_PATH, TRAILING_SLASH: "1", SITE_URL: SITE_BASE_URL, NEXT_PUBLIC_SPONSORKIT_API_BASE: API_ORIGIN };

function run(cmd, args, cwd, env = {}) {
  const t = Date.now();
  console.log(`[e2e build] ${path.relative(REPO_ROOT, cwd) || "."}: ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit" });
  if (r.status !== 0) {
    throw new Error(`[e2e build] failed (${r.status ?? r.signal}): ${cmd} ${args.join(" ")}`);
  }
  console.log(`[e2e build] done in ${((Date.now() - t) / 1000).toFixed(1)}s`);
}

mkdirSync(CACHE_DIR, { recursive: true });

// 1. SDK
const sdkReady = existsSync(path.join(SDK_DIST_DIR, "index.js"));
if ((skipAll && sdkReady) || process.env.E2E_SKIP_SDK_BUILD === "1") {
  console.log("[e2e build] SDK: using existing", path.relative(REPO_ROOT, SDK_DIST_DIR));
} else {
  run("bun", ["run", "build"], path.join(REPO_ROOT, "sdks", "js"));
}

// 2. Site
let stampOk = false;
try {
  stampOk = JSON.stringify(JSON.parse(readFileSync(stampFile, "utf8"))) === JSON.stringify(stamp);
} catch {
  stampOk = false;
}
const siteReady = existsSync(path.join(SITE_DIR, "connect", "index.html")) && stampOk;
if ((skipAll && siteReady) || process.env.E2E_SKIP_SITE_BUILD === "1") {
  console.log("[e2e build] site: using existing", path.relative(REPO_ROOT, SITE_DIR));
} else {
  const webDir = path.join(REPO_ROOT, "web");
  const webOut = path.join(webDir, "out");
  const backup = path.join(CACHE_DIR, "web-out-backup");
  rmSync(backup, { recursive: true, force: true });
  const hadOut = existsSync(webOut);
  if (hadOut) renameSync(webOut, backup);
  try {
    run("bun", ["run", "build"], webDir, stamp);
    if (!existsSync(path.join(webOut, "connect", "index.html"))) {
      throw new Error("[e2e build] web build produced no out/connect/index.html (is TRAILING_SLASH honoured?)");
    }
    rmSync(SITE_DIR, { recursive: true, force: true });
    renameSync(webOut, SITE_DIR);
    writeFileSync(stampFile, `${JSON.stringify(stamp, null, 2)}\n`);
  } finally {
    if (hadOut) {
      rmSync(webOut, { recursive: true, force: true });
      renameSync(backup, webOut);
    }
  }
}
console.log("[e2e build] ready:", path.relative(REPO_ROOT, SITE_DIR), "and", path.relative(REPO_ROOT, SDK_DIST_DIR));
