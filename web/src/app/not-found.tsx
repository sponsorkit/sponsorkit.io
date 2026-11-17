import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { DocsNotFoundHint } from "@/components/docs/not-found-hint";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="container not-found">
        <p className="big" aria-hidden="true">
          404
        </p>
        <h1>Page not found</h1>
        <p className="muted">That page doesn’t exist, or it moved.</p>
        <DocsNotFoundHint />
        <div className="cta-row" style={{ justifyContent: "center" }}>
          <Link className="btn" href="/">
            Go home
          </Link>
          <Link className="btn btn-secondary" href="/docs">
            Read the docs
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
