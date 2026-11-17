import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/chrome";

/** Docs pages render their own <main> (the sidebar is a sibling navigation landmark). */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader current="docs" />
      {children}
      <SiteFooter />
    </>
  );
}
