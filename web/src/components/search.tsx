"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type PreparedEntry, type SearchEntry, type SearchIndexFile, prepare, search, snippet } from "@/lib/docs/search-core";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

let indexPromise: Promise<PreparedEntry[]> | null = null;
function loadIndex(): Promise<PreparedEntry[]> {
  indexPromise ??= fetch(`${BASE_PATH}/search-index.json`)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<SearchIndexFile>;
    })
    .then((f) => prepare(f.entries))
    .catch((e) => {
      indexPromise = null;
      throw e;
    });
  return indexPromise;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Header search button + dialog. Opens with "/" (or Ctrl/⌘ K). */
export function Search() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<PreparedEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(0);

  const open = useCallback(() => {
    const d = dialog.current;
    if (!d || d.open) return;
    d.showModal();
    input.current?.select();
    loadIndex().then(
      (i) => {
        setIndex(i);
        setError(false);
      },
      () => setError(true),
    );
  }, []);

  const close = useCallback(() => dialog.current?.close(), []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target);
      const cmdK = (e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey);
      if (slash || cmdK) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const results: SearchEntry[] = useMemo(() => (index && query.trim() ? search(index, query, 30) : []), [index, query]);

  useEffect(() => setSelected(0), [query]);

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      // type=search would otherwise only clear the field.
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && results[selected]) {
      e.preventDefault();
      close();
      router.push(results[selected].u);
    }
  }

  useEffect(() => {
    document.getElementById(`search-result-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <>
      <button type="button" className="search-button" onClick={open} aria-keyshortcuts="/ Control+K Meta+K">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="search-button-label">Search</span>
        <span className="sr-only"> docs</span>
        <kbd aria-hidden="true">/</kbd>
      </button>
      <dialog
        ref={dialog}
        className="search-dialog"
        aria-label="Search the docs"
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        <div className="search-panel">
          <div className="search-input-row">
            <label htmlFor="docs-search-input" className="sr-only">
              Search the docs
            </label>
            <input
              ref={input}
              id="docs-search-input"
              type="search"
              placeholder="Search the docs and API reference"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="docs-search-results"
              aria-activedescendant={results.length ? `search-result-${selected}` : undefined}
              aria-autocomplete="list"
            />
            <button type="button" className="search-close" onClick={close}>
              Esc<span className="sr-only"> (close search)</span>
            </button>
          </div>
          <div className="search-status" aria-live="polite">
            {error
              ? "Search is unavailable right now."
              : !index
                ? "Loading…"
                : query.trim() && results.length === 0
                  ? `No results for “${query.trim()}”.`
                  : query.trim()
                    ? `${results.length} result${results.length === 1 ? "" : "s"}`
                    : ""}
          </div>
          <ul id="docs-search-results" className="search-results" role="listbox" aria-label="Results">
            {results.map((r, i) => (
              <li key={r.u} id={`search-result-${i}`} role="option" aria-selected={i === selected}>
                <Link href={r.u} onClick={close} onMouseMove={() => setSelected(i)} tabIndex={-1}>
                  <span className="search-result-crumbs">
                    {r.c}
                    {r.r ? <span className="search-result-tag">API</span> : null}
                  </span>
                  <span className="search-result-title">{r.t}</span>
                  {r.x ? <span className="search-result-text">{snippet(r.x, query)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
