import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FlowHeader } from "@/components/chrome";

export const metadata: Metadata = {
  // Supporter pages carry one-off parameters; keep them out of search results and referrers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
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
