"use client";

import { Children, type KeyboardEvent, type ReactNode, isValidElement, useId, useRef, useSyncExternalStore } from "react";

export interface TabSpec {
  key: string;
  label: string;
}

const STORAGE_PREFIX = "sponsorkit.tabs.";
const EVENT = "sponsorkit:tabs";

function readChoice(group: string): string | null {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + group);
  } catch {
    return null;
  }
}

function writeChoice(group: string, key: string) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + group, key);
  } catch {
    // Storage blocked (private mode, sandboxed iframe): the choice still syncs on this page.
    memory.set(group, key);
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: group }));
}

const memory = new Map<string, string>();

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Tabbed content. Every Tabs with the same `group` shows the same tab, and the reader's choice is
 * remembered across pages (localStorage `sponsorkit.tabs.<group>`).
 */
export function Tabs({ group, tabs, children }: { group: string; tabs: TabSpec[]; children: ReactNode }) {
  const stored = useSyncExternalStore(
    subscribe,
    () => readChoice(group) ?? memory.get(group) ?? null,
    () => null,
  );
  const active = tabs.some((t) => t.key === stored) ? stored! : (tabs[0]?.key ?? "");
  const base = useId();
  const listRef = useRef<HTMLDivElement>(null);

  function select(key: string, focus = false) {
    // Keep the clicked tab list still while panels above it change height.
    const before = listRef.current?.getBoundingClientRect().top ?? 0;
    writeChoice(group, key);
    requestAnimationFrame(() => {
      const after = listRef.current?.getBoundingClientRect().top ?? 0;
      if (Math.abs(after - before) > 1) window.scrollBy(0, after - before);
      if (focus) listRef.current?.querySelector<HTMLButtonElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.key === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(tabs[next]!.key, true);
  }

  const panels = Children.toArray(children).filter(isValidElement) as React.ReactElement<{ "data-tab-key"?: string }>[];

  return (
    <div className="tabs" data-group={group}>
      <div ref={listRef} className="tab-list" role="tablist" aria-label="Choose a variant" onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`${base}-tab-${t.key}`}
            data-key={t.key}
            aria-selected={t.key === active}
            aria-controls={`${base}-panel-${t.key}`}
            tabIndex={t.key === active ? 0 : -1}
            onClick={() => select(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {panels.map((p, i) => {
        const key = p.props["data-tab-key"] ?? tabs[i]?.key ?? String(i);
        return (
          <div
            key={key}
            role="tabpanel"
            id={`${base}-panel-${key}`}
            aria-labelledby={`${base}-tab-${key}`}
            className="tab-panel"
            hidden={key !== active}
          >
            {p}
          </div>
        );
      })}
    </div>
  );
}
