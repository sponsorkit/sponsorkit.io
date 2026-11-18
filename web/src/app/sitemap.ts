import type { MetadataRoute } from "next";
import { getDocsSite } from "@/lib/docs/site";
import { absoluteUrl } from "@/lib/site";

// Emitted at build time as out/sitemap.xml. Lists the landing page and every real docs page; the
// supporter pages (/connect/, /checkout/, …) are noindex and only make sense with parameters.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = getDocsSite()
    .pages.filter((p) => !p.placeholder)
    .map((p) => ({ url: absoluteUrl(p.url) }));
  return [{ url: absoluteUrl("/") }, ...docs];
}
