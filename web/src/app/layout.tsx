import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://sponsorkit.io"),
  title: {
    default: "Sponsorkit — sponsorships inside your software",
    template: "%s · Sponsorkit",
  },
  description:
    "Check whether the current user sponsors you on GitHub Sponsors or Open Collective, and send them to contribute. No account, no API key, no stored data.",
  openGraph: {
    title: "Sponsorkit",
    description: "Build GitHub Sponsors and Open Collective contributions straight into your software.",
    url: "https://sponsorkit.io",
    siteName: "Sponsorkit",
    type: "website",
  },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d14" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
