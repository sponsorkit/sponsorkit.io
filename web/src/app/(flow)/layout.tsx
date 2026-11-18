import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FlowHeader } from "@/components/chrome";

export const metadata: Metadata = {
  // Supporter pages carry one-off parameters; keep them out of search results, and keep the path
  // and query out of Referer.
  robots: { index: false, follow: false },
  // strict-origin, not no-referrer: the sign-in start is a cross-origin form POST that must carry
  // this site's real Origin; no-referrer would make it `Origin: null` (PROTOCOL §4.1, §4.3).
  referrer: "strict-origin",
};

export default function FlowLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <FlowHeader />
      <main id="main" className="flow-main">
        {children}
      </main>
    </>
  );
}
