import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");

// Optional, for hosting the static export under a sub-path (e.g. GitHub Pages project sites):
//   BASE_PATH=/sponsorkit.io TRAILING_SLASH=1 bun run build
// The default (served by the Worker at the domain root) is neither.
const basePath = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");
const trailingSlash = process.env.TRAILING_SLASH === "1";

const config: NextConfig = {
  // Served by the Worker as static assets from web/out. No server rendering at runtime.
  output: "export",
  // `/connect/done` → out/connect/done.html; the Worker's asset handling resolves both forms.
  trailingSlash,
  ...(basePath ? { basePath } : {}),
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_TRAILING_SLASH: trailingSlash ? "1" : "" },
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  // @sponsorkit/shared ships TypeScript sources.
  transpilePackages: ["@sponsorkit/shared"],
  // Bun workspaces hoist node_modules to the repo root.
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default config;
