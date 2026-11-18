/**
 * Two small static servers:
 *  - the **site**: the web/ export served under its base path with GitHub Pages semantics
 *    (`<base>/x/` → x/index.html, `<base>/x` → 301 to `<base>/x/` when that directory exists,
 *    `<base>/x` → x.html, unknown → 404.html with status 404, only GET/HEAD);
 *  - the **app**: a third-party page that loads the built JS SDK (sdks/js/dist) as ES modules.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

function inside(root, rel) {
  const abs = path.join(root, path.normalize(rel).replace(/^([/\\])+/, ""));
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}

function sendFile(res, file, status = 200, method = "GET") {
  res.writeHead(status, {
    "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () =>
      resolve({
        server,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
            server.closeAllConnections();
          }),
      }),
    );
  });
}

/** GitHub Pages-like server for the static export in `root`, mounted at `basePath`. */
export function startSiteServer({ root, basePath, host, port }) {
  root = path.resolve(root);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain" }).end("Method not allowed");
      return;
    }
    if (basePath && url.pathname === basePath) {
      res.writeHead(301, { Location: `${basePath}/${url.search}` }).end();
      return;
    }
    let file = null;
    if (!basePath || url.pathname.startsWith(`${basePath}/`)) {
      let rel;
      try {
        rel = decodeURIComponent(url.pathname.slice(basePath.length));
      } catch {
        rel = null;
      }
      const abs = rel === null ? null : inside(root, rel);
      if (abs) {
        if (rel.endsWith("/")) {
          if (await isFile(path.join(abs, "index.html"))) file = path.join(abs, "index.html");
        } else if (await isFile(abs)) file = abs;
        else if (await isFile(`${abs}.html`)) file = `${abs}.html`;
        else if (await isFile(path.join(abs, "index.html"))) {
          res.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end();
          return;
        }
      }
    }
    if (file) return sendFile(res, file, 200, req.method);
    const notFound = path.join(root, "404.html");
    if (await isFile(notFound)) return sendFile(res, notFound, 404, req.method);
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  });
  return listen(server, host, port);
}

/**
 * The third-party app: `/` is a page that imports the SDK from `/sdk/index.js` and exposes
 * buttons that call it (popups must open from a click). `options` are passed to `new Sponsorkit()`.
 */
export function startAppServer({ sdkDir, host, port, options }) {
  sdkDir = path.resolve(sdkDir);
  const page = appPage(options);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(page);
    }
    if (url.pathname.startsWith("/sdk/")) {
      const abs = inside(sdkDir, decodeURIComponent(url.pathname.slice("/sdk/".length)));
      if (abs && (await isFile(abs))) return sendFile(res, abs, 200, req.method);
    }
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  });
  return listen(server, host, port);
}

function appPage(options) {
  const cfg = JSON.stringify(options).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Example app (e2e)</title>
</head>
<body>
<h1>Example app</h1>
<p>A third-party app on its own origin that uses the Sponsorkit JS SDK.</p>
<button id="signin">Sign in with GitHub</button>
<button id="signin-oc">Sign in with Open Collective</button>
<button id="checkout">Sponsor $5/month on GitHub</button>
<pre id="out"></pre>
<script type="application/json" id="cfg">${cfg}</script>
<script type="module">
  import * as sdk from "/sdk/index.js";
  const options = JSON.parse(document.getElementById("cfg").textContent);
  const sk = new sdk.Sponsorkit(options);
  window.sdk = sdk;
  window.sk = sk;
  window.results = {};
  const settle = (name, p) => {
    window.results[name] = p.then(
      (v) => ({ ok: true, value: v && typeof v.toJSON === "function" ? v.toJSON() : v }),
      (e) => ({ ok: false, code: e && e.code, message: String(e && e.message) }),
    );
    window.results[name].then((r) => { document.getElementById("out").textContent = name + ": " + JSON.stringify(r, null, 2); });
  };
  document.getElementById("signin").onclick = () => settle("signIn", sk.signIn({ provider: "github" }));
  document.getElementById("signin-oc").onclick = () => settle("signInOc", sk.signIn({ provider: "opencollective" }));
  document.getElementById("checkout").onclick = () =>
    settle("checkout", sk.openCheckout({ provider: "github", frequency: "monthly", amount: 500, timeout: 60 }));
  window.appReady = true;
</script>
</body>
</html>`;
}
