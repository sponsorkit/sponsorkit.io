import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");

const config: NextConfig = {
  // Served by the Worker as static assets from web/out. No server rendering at runtime.
  output: "export",
  // `/connect/done` → out/connect/done.html; the Worker's asset handling resolves both forms.
  trailingSlash: false,
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
