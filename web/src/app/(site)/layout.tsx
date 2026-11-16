import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/chrome";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
