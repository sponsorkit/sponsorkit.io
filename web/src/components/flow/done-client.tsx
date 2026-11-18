"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WindowMessage } from "@sponsorkit/shared";
import { checkoutContinueHref, errorMessage, parseDoneHash, type DoneState } from "@/lib/done";
import { AlertIcon, ArrowRightIcon, CheckIcon, CopyIcon } from "../icons";
import { Loading } from "./consent";

type Outcome =
  | { kind: "posted"; closing: boolean }
  | { kind: "continuing"; href: string }
  | { kind: "no_opener"; continueHref: string | null }
  | { kind: "paste"; code: string; continueHref: string | null }
  | { kind: "error"; error: string }
  | { kind: "invalid"; reason: string }
  | { kind: "empty" };

/** Posts to `window.opener` with an explicit target origin only. Returns false if there is no opener. */
function postToOpener(message: WindowMessage, origin: string): boolean {
  const opener = window.opener as Window | null;
  if (!opener || opener === window) return false;
  try {
    opener.postMessage(message, origin);
    return true;
  } catch {
    return false;
  }
}

function handle(state: DoneState): Outcome {
  switch (state.kind) {
    case "code": {
      const posted = postToOpener({ type: "sponsorkit:code", code: state.code }, state.origin);
      const continueHref = state.continueQuery ? checkoutContinueHref(state.continueQuery) : null;
      if (!posted) return { kind: "no_opener", continueHref };
      if (continueHref) return { kind: "continuing", href: continueHref };
      return { kind: "posted", closing: true };
    }
    case "paste":
      return { kind: "paste", code: state.code, continueHref: state.continueQuery ? checkoutContinueHref(state.continueQuery) : null };
    case "error":
      if (state.origin) postToOpener({ type: "sponsorkit:error", error: state.error }, state.origin);
      return { kind: "error", error: state.error };
    case "invalid":
      return { kind: "invalid", reason: state.reason };
    case "empty":
      return { kind: "empty" };
  }
}

/** `/connect/done/` (PROTOCOL §4.5). */
export function DoneClient() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    // Read the fragment first, then remove it so the code never lingers in history or the address bar.
    const state = parseDoneHash(window.location.hash);
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    const result = handle(state);
    setOutcome(result);

    if (result.kind === "continuing") {
      window.location.replace(result.href);
    } else if (result.kind === "posted") {
      // Not cleared on unmount: the ref guard means this effect body runs once, even under StrictMode.
      window.setTimeout(() => {
        window.close();
        // If the window is still here, closing isn't allowed: tell the user instead.
        window.setTimeout(() => setOutcome({ kind: "posted", closing: false }), 150);
      }, 300);
    }
  }, []);

  if (!outcome) return <Loading label="Finishing sign-in…" />;

  switch (outcome.kind) {
    case "posted":
      return (
        <StatusPanel tone="ok" title="You’re signed in">
          <p className="muted" data-testid="done-message">
            {outcome.closing ? "Returning to the app…" : "You can close this window."}
          </p>
        </StatusPanel>
      );
    case "continuing":
      return <Loading label="Signed in. Continuing to checkout…" />;
    case "no_opener":
      return (
        <StatusPanel tone="error" title="This window lost track of the app">
          <p className="muted">
            The window that opened this page is gone, so the sign-in couldn’t be handed back. Return to the app and try again.
          </p>
          {outcome.continueHref ? (
            <p>
              <a href={outcome.continueHref}>Continue to checkout without signing in</a>
            </p>
          ) : null}
        </StatusPanel>
      );
    case "paste":
      return <PastePanel code={outcome.code} continueHref={outcome.continueHref} />;
    case "error": {
      const m = errorMessage(outcome.error);
      return (
        <StatusPanel tone="error" title={m.title}>
          <p className="muted" data-testid="done-message">
            {m.body}
          </p>
        </StatusPanel>
      );
    }
    case "invalid":
      return (
        <StatusPanel tone="error" title="This link doesn’t work">
          <p className="muted">{outcome.reason} Start again from the app.</p>
        </StatusPanel>
      );
    case "empty":
      return (
        <StatusPanel tone="error" title="Nothing to finish here">
          <p className="muted">
            This page completes a sign-in started from an app. Start from the app, or read <Link href="/docs">how Sponsorkit works</Link>.
          </p>
        </StatusPanel>
      );
  }
}

function StatusPanel({ tone, title, children }: { tone: "ok" | "error"; title: string; children: ReactNode }) {
  return (
    <section className="panel" aria-labelledby="status-title" aria-live="polite">
      <div className={`status-icon ${tone}`}>{tone === "ok" ? <CheckIcon size={24} /> : <AlertIcon size={24} />}</div>
      <h1 id="status-title">{title}</h1>
      {children}
    </section>
  );
}

function PastePanel({ code, continueHref }: { code: string; continueHref: string | null }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const outputRef = useRef<HTMLOutputElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("copied");
    } catch {
      // Clipboard API unavailable (e.g. insecure context): select the text so the user can copy it.
      const el = outputRef.current;
      const sel = window.getSelection();
      if (el && sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      setCopied("failed");
    }
  }

  return (
    <section className="panel" aria-labelledby="paste-title">
      <div className="status-icon ok">
        <CheckIcon size={24} />
      </div>
      <h1 id="paste-title">You’re signed in</h1>
      <p>Paste this into the app (valid for 10 minutes)</p>
      <div className="code-box">
        <output ref={outputRef} aria-label="Sign-in code" data-testid="paste-code">
          {code}
        </output>
        <button type="button" className="btn btn-secondary" onClick={copy} data-testid="copy-code">
          {copied === "copied" ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
          {copied === "copied" ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="small muted" role="status" aria-live="polite">
        {copied === "copied" ? "Copied to the clipboard." : copied === "failed" ? "Couldn’t copy automatically. The code is selected; copy it with your keyboard." : ""}
      </p>
      <p className="small muted">The code only works in the app that asked for it. It’s useless to anyone else.</p>
      {continueHref ? (
        <div className="actions">
          <a className="btn btn-block" href={continueHref} data-testid="continue-checkout">
            Continue to checkout
            <ArrowRightIcon size={18} />
          </a>
        </div>
      ) : null}
    </section>
  );
}
