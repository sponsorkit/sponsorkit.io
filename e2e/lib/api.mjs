/**
 * Runs the real Worker (app/src) with `wrangler dev`, configured as the split deployment's API:
 * a config generated from app/wrangler.jsonc (custom-domain route removed, the per-session refresh
 * limit removed so checkout polling isn't throttled, PUBLIC_ORIGIN / SITE_ORIGIN / SITE_BASE_URL
 * pointed at the local servers) plus a generated .dev.vars with fake OAuth clients, random sealing
 * keys and the fake provider base URLs. Everything generated lives in e2e/.cache.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { API, API_ORIGIN, CACHE_DIR, CLIENTS, GITHUB_METADATA_TOKEN, INSPECTOR_PORT, PROVIDER_BASES, REPO_ROOT, SITE_BASE_URL, SITE_ORIGIN } from "./config.mjs";

/** Strip // and /* *\/ comments and trailing commas from JSONC, leaving strings alone. */
export function parseJsonc(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (ch === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      i = i < 0 ? text.length : i + 2;
    } else {
      out += ch;
      i++;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** Rate limit bindings removed for the e2e run. */
const DROPPED_RATELIMITS = new Set(["RL_REFRESH"]);

export function writeWorkerConfig() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const appDir = path.join(REPO_ROOT, "app");
  const base = parseJsonc(readFileSync(path.join(appDir, "wrangler.jsonc"), "utf8"));
  const cfg = { ...base };
  delete cfg.$schema;
  delete cfg.routes;
  delete cfg.route;
  delete cfg.assets; // API only (PROTOCOL §0); should already be absent.
  cfg.name = `${base.name ?? "sponsorkit"}-e2e`;
  cfg.main = path.relative(CACHE_DIR, path.join(appDir, base.main ?? "src/index.ts"));
  if (Array.isArray(cfg.ratelimits)) cfg.ratelimits = cfg.ratelimits.filter((r) => !DROPPED_RATELIMITS.has(r.name));
  cfg.observability = { enabled: false };
  cfg.vars = {
    ...(base.vars ?? {}),
    PUBLIC_ORIGIN: API_ORIGIN,
    SITE_BASE_URL,
    SITE_ORIGIN,
  };
  const configPath = path.join(CACHE_DIR, "wrangler.json");
  writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`);

  const key = randomBytes(32).toString("base64url");
  const vars = {
    GITHUB_CLIENT_ID: CLIENTS.github.id,
    GITHUB_CLIENT_SECRET: CLIENTS.github.secret,
    OPENCOLLECTIVE_CLIENT_ID: CLIENTS.opencollective.id,
    OPENCOLLECTIVE_CLIENT_SECRET: CLIENTS.opencollective.secret,
    SEALING_KEYS: JSON.stringify([{ id: 7, key }]),
    PAIRWISE_KEY: randomBytes(24).toString("base64url"),
    GITHUB_METADATA_TOKEN,
    ...PROVIDER_BASES,
  };
  // wrangler reads .dev.vars next to the config file.
  writeFileSync(
    path.join(CACHE_DIR, ".dev.vars"),
    `${Object.entries(vars)
      .map(([k, v]) => `${k}=${/[\s"#{}[\]]/.test(v) ? `'${v}'` : v}`)
      .join("\n")}\n`,
  );
  return configPath;
}

function wranglerBin() {
  for (const p of [path.join(REPO_ROOT, "e2e", "node_modules", ".bin", "wrangler"), path.join(REPO_ROOT, "app", "node_modules", ".bin", "wrangler"), path.join(REPO_ROOT, "node_modules", ".bin", "wrangler")]) {
    if (existsSync(p)) return { cmd: p, pre: [] };
  }
  return { cmd: "npx", pre: ["wrangler"] };
}

async function waitFor(url, { timeoutMs, proc, output }) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`wrangler dev exited with ${proc.exitCode}:\n${output()}`);
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`wrangler dev not ready at ${url}: ${lastErr}\n${output()}`);
}

export async function startApi({ timeoutMs = 120_000, verbose = !!process.env.E2E_VERBOSE } = {}) {
  const configPath = writeWorkerConfig();
  const { cmd, pre } = wranglerBin();
  const args = [
    ...pre,
    "dev",
    "--config",
    configPath,
    "--ip",
    API.bind,
    "--port",
    String(API.port),
    "--inspector-port",
    String(INSPECTOR_PORT),
    "--persist-to",
    path.join(CACHE_DIR, "wrangler-state"),
    "--show-interactive-dev-session=false",
    "--live-reload=false",
  ];
  let buf = "";
  const proc = spawn(cmd, args, {
    cwd: path.join(REPO_ROOT, "app"),
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", FORCE_COLOR: "0", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const onData = (d) => {
    buf += d.toString();
    if (buf.length > 200_000) buf = buf.slice(-100_000);
    if (verbose) process.stderr.write(`[wrangler] ${d}`);
  };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);
  await waitFor(`${API_ORIGIN}/api/v1/health`, { timeoutMs, proc, output: () => buf.slice(-8000) });
  return {
    proc,
    output: () => buf,
    async close() {
      if (proc.exitCode !== null) return;
      const gone = new Promise((r) => proc.once("exit", r));
      try {
        // Kill the whole group: wrangler spawns workerd.
        process.kill(-proc.pid, "SIGTERM");
      } catch {
        proc.kill("SIGTERM");
      }
      const t = setTimeout(() => {
        try {
          process.kill(-proc.pid, "SIGKILL");
        } catch {
          proc.kill("SIGKILL");
        }
      }, 5000);
      await gone;
      clearTimeout(t);
    },
  };
}
