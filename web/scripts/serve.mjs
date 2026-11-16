#!/usr/bin/env node
// Minimal static server for web/out, mirroring Workers static-asset HTML handling:
// `/connect/done` → connect/done.html, `/` → index.html, unknown paths → 404.html (status 404).
// Usage: node scripts/serve.mjs [--port 4173] [--dir out]
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", arg("dir", "out"));
const port = Number(arg("port", process.env.PORT ?? "4173"));
const host = arg("host", "127.0.0.1");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function resolveFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const rel = path.normalize(decoded).replace(/^([/\\])+/, "");
  const abs = path.join(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  const candidates = decoded.endsWith("/")
    ? [path.join(abs, "index.html"), `${abs.replace(/[/\\]$/, "")}.html`]
    : [abs, `${abs}.html`, path.join(abs, "index.html")];
  for (const c of candidates) if (await isFile(c)) return c;
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let file = await resolveFile(url.pathname);
  let status = 200;
  if (!file) {
    file = path.join(root, "404.html");
    status = 404;
    if (!(await isFile(file))) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
  }
  res.writeHead(status, {
    "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  const addr = server.address();
  console.log(`LISTENING ${typeof addr === "object" && addr ? addr.port : port}`);
});
