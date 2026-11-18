import type { MetadataRoute } from "next";
import { BASE_PATH, SITE_PATHS, SITE_URL } from "@/lib/site";

// Emitted at build time as out/robots.txt. On a GitHub Pages project site this file is served at
// <origin><base path>/robots.txt; it still documents intent and points at the sitemap.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: `${BASE_PATH}/`,
      // Supporter pages: one-off parameters, noindex.
      disallow: [SITE_PATHS.connect, SITE_PATHS.checkout].map((p) => `${BASE_PATH}${p}`),
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
