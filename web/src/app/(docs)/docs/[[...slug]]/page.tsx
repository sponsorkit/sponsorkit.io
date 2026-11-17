import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsPageView } from "@/components/docs/page-view";
import { compilePage } from "@/lib/docs/compile";
import { getDocsSite, urlOf } from "@/lib/docs/site";

type Params = { slug?: string[] };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getDocsSite().pages.map((p) => ({ slug: p.slug }));
}

function pageFor(slug: string[] | undefined) {
  return getDocsSite().byUrl.get(urlOf(slug ?? []));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const page = pageFor((await params).slug);
  if (!page) return {};
  return {
    title: page.url === "/docs" ? "Docs" : page.title,
    description: page.description,
    alternates: { canonical: page.url },
    ...(page.placeholder ? { robots: { index: false } } : {}),
  };
}

export default async function DocsRoute({ params }: { params: Promise<Params> }) {
  const site = getDocsSite();
  const page = pageFor((await params).slug);
  if (!page) notFound();
  const compiled = await compilePage(site, page);
  return <DocsPageView site={site} page={page} compiled={compiled} />;
}
