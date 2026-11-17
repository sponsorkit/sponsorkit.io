"use client";

import { useEffect, useState } from "react";
import type { TocHeading } from "@/lib/docs/markdown";

/** "On this page" links; highlights the section currently in view. */
export function TocList({ items }: { items: TocHeading[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current: string | null = null;
      for (const el of els) if (el.getBoundingClientRect().top < 120) current = el.id;
      setActive(current ?? els[0]!.id);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  return (
    <ul className="toc-list">
      {items.map((i) => (
        <li key={i.id} data-depth={i.depth}>
          <a href={`#${i.id}`} aria-current={active === i.id ? "location" : undefined}>
            {i.text}
          </a>
        </li>
      ))}
    </ul>
  );
}
