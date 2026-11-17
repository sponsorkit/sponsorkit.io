import Link from "next/link";
import type { CompiledMarkdown } from "@/lib/docs/markdown";
import { type DocPage, type DocsSite, ancestorsOf, prevNext } from "@/lib/docs/site";
import { DocsDrawer } from "./drawer";
import { Markdown } from "./markdown";
import { SidebarTree } from "./sidebar";
import { TocList } from "./toc";

function Breadcrumbs({ site, page }: { site: DocsSite; page: DocPage }) {
  const trail = ancestorsOf(site.nav, page.url).filter((s) => s.url !== page.url);
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {page.url !== "/docs" ? (
          <li>
            <Link href="/docs">Docs</Link>
          </li>
        ) : null}
        {trail.map((s) => (
          <li key={s.id}>{s.url ? <Link href={s.url}>{s.title}</Link> : <span>{s.title}</span>}</li>
        ))}
        <li>
          <span aria-current="page">{page.url === "/docs" ? "Docs" : page.title}</span>
        </li>
      </ol>
    </nav>
  );
}

function PageFooter({ site, page }: { site: DocsSite; page: DocPage }) {
  const { prev, next } = prevNext(site, page);
  return (
    <footer className="docs-page-footer">
      {page.editUrl || page.sourceUrl ? (
        <p className="docs-edit">
          {page.editUrl ? <a href={page.editUrl}>Edit this page on GitHub</a> : null}
          {page.sourceUrl ? <a href={page.sourceUrl}>View source on GitHub</a> : null}
        </p>
      ) : null}
      {prev || next ? (
        <nav aria-label="Previous and next pages" className="pager">
          {prev ? (
            <Link href={prev.url} className="pager-link pager-prev" rel="prev">
              <span className="pager-dir">Previous</span>
              <span className="pager-title">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={next.url} className="pager-link pager-next" rel="next">
              <span className="pager-dir">Next</span>
              <span className="pager-title">{next.title}</span>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </footer>
  );
}

export function DocsPageView({ site, page, compiled }: { site: DocsSite; page: DocPage; compiled: CompiledMarkdown }) {
  const toc = page.toc ? compiled.toc : [];
  const empty = compiled.hast.children.every((c) => c.type === "text" && !c.value.trim());
  return (
    <div className="docs-shell">
      <DocsDrawer>
        <SidebarTree nodes={site.nav} current={page.url} />
      </DocsDrawer>
      <main id="main" className="docs-main" tabIndex={-1}>
        <Breadcrumbs site={site} page={page} />
        <article className="prose docs-article" data-realm={page.realm} data-placeholder={page.placeholder ? "true" : undefined}>
          <header className="docs-article-head">
            <h1>{page.title}</h1>
            <p className="lede">{page.description}</p>
          </header>
          {toc.length > 1 ? (
            <details className="toc-inline">
              <summary>On this page</summary>
              <TocList items={toc} />
            </details>
          ) : null}
          {page.stub ? (
            <div className="callout callout-note" role="note">
              <p className="callout-title">Placeholder</p>
              <p>This reference was produced by a stub generator; the real one hasn&rsquo;t been written yet.</p>
            </div>
          ) : null}
          {empty ? (
            <div className="callout callout-note" role="note">
              <p className="callout-title">Coming soon</p>
              <p>This page hasn&rsquo;t been written yet.</p>
            </div>
          ) : (
            <Markdown hast={compiled.hast} />
          )}
        </article>
        <PageFooter site={site} page={page} />
      </main>
      <div className="docs-toc-col">
        {toc.length > 1 ? (
          <nav aria-label="On this page" className="docs-toc">
            <p className="docs-toc-title">On this page</p>
            <TocList items={toc} />
          </nav>
        ) : null}
      </div>
    </div>
  );
}
