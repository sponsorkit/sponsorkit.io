import Link from "next/link";
import { HeartIcon } from "./icons";

export const REPO_URL = "https://github.com/sponsorkit/sponsorkit.io";
export const PROTOCOL_URL = `${REPO_URL}/blob/main/docs/PROTOCOL.md`;
export const SPEC_URL = `${REPO_URL}/blob/main/docs/SPEC.md`;

export function Brand() {
  return (
    <Link href="/" className="brand">
      <HeartIcon size={22} />
      <span>Sponsorkit</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Brand />
        <nav className="nav" aria-label="Main">
          <Link href="/docs">Docs</Link>
          <a href={REPO_URL}>GitHub</a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <p style={{ margin: 0 }}>Sponsorkit is open source (MIT). No cookies, no trackers, no stored data.</p>
        <nav aria-label="Footer">
          <Link href="/docs">Docs</Link>
          <a href={PROTOCOL_URL}>Protocol</a>
          <a href={REPO_URL}>Source</a>
        </nav>
      </div>
    </footer>
  );
}

export function FlowHeader() {
  return (
    <header className="flow-header">
      <div className="container">
        <Brand />
      </div>
    </header>
  );
}
