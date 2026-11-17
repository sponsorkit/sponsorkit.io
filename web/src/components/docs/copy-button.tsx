"use client";

import { useRef, useState } from "react";

/** Copies the code of the enclosing `figure.code` block. */
export function CopyButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    const pre = ref.current?.closest("figure")?.querySelector("pre");
    const text = (pre?.innerText ?? "").replace(/\n$/, "");
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch {
        ok = false;
      }
    }
    setState(ok ? "copied" : "failed");
    window.setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button ref={ref} type="button" className="copy-button" onClick={copy} data-state={state}>
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}</span>
      <span className="sr-only"> code</span>
    </button>
  );
}
