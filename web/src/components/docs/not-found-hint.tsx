"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** On the static 404 page: when the missing URL was a docs page, suggest searching the docs. */
export function DocsNotFoundHint() {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => setPath(window.location.pathname), []);
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (!path || !path.startsWith(`${base}/docs`)) return null;
  return (
    <p className="docs-404-hint" data-testid="docs-404-hint">
      Looking for documentation? Press <kbd>/</kbd> to search the docs, or start from the{" "}
      <Link href="/docs">docs home</Link>.
    </p>
  );
}
