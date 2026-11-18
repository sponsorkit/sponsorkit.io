import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { siteConfig } from "./site-config";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");

// GitHub Pages project site by default: basePath /sponsorkit.io, trailing slashes, API on
// https://api.sponsorkit.io. Overrides and single-origin self-hosting: see site-config.ts.
const site = siteConfig();

const config: NextConfig = {
  // Static export (web/out), deployed to GitHub Pages. No server rendering at runtime.
  output: "export",
  // GitHub Pages serves directories: `/connect/` → out/connect/index.html.
  trailingSlash: site.trailingSlash,
  ...(site.basePath ? { basePath: site.basePath } : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: site.basePath,
    NEXT_PUBLIC_TRAILING_SLASH: site.trailingSlash ? "1" : "",
    NEXT_PUBLIC_SITE_URL: site.siteUrl,
    NEXT_PUBLIC_SPONSORKIT_API_BASE: site.apiBase,
  },
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
