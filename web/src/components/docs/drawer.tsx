"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Docs sidebar container: a sticky column on wide screens, an off-canvas drawer opened by the
 * "Menu" button on narrow ones.
 */
export function DocsDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("drawer-open");
    panel.current?.querySelector<HTMLElement>("[aria-current='page'], a, summary")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("drawer-open");
    };
  }, [open]);

  return (
    <div className="docs-sidebar-wrap">
      <div className="docs-mobile-bar">
        <button
          ref={button}
          type="button"
          className="docs-menu-button"
          aria-expanded={open}
          aria-controls="docs-sidebar"
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Menu
        </button>
      </div>
      {open ? <div className="docs-backdrop" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
      <nav ref={panel} id="docs-sidebar" className="docs-sidebar" aria-label="Documentation" data-open={open ? "true" : "false"}>
        <div className="docs-drawer-head">
          <span>Documentation</span>
          <button
            type="button"
            className="docs-drawer-close"
            onClick={() => {
              setOpen(false);
              button.current?.focus();
            }}
          >
            Close<span className="sr-only"> menu</span>
          </button>
        </div>
        {children}
      </nav>
    </div>
  );
}
