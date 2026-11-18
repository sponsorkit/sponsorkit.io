"use client";

import { Fragment, type ReactNode } from "react";
import type { Provider, Target, TargetInfo } from "@sponsorkit/shared";
import { apiBase } from "@/lib/api";
import { buildStartForm, requesterOf, type Requester, type SignInParams } from "@/lib/params";
import { AlertIcon, ProviderIcon, ShieldIcon } from "../icons";
import { findInfo, TargetRow } from "./targets";
import type { TargetsState } from "./use-targets";

const BUTTON_LABEL: Record<Provider, string> = {
  github: "Continue with GitHub",
  opencollective: "Continue with Open Collective",
};

const PROVIDER_SHORT: Record<Provider, string> = {
  github: "GitHub",
  opencollective: "Open Collective",
};

/**
 * True when the page runs inside a frame. GitHub Pages can't send anti-framing headers, so the
 * pages that start sign-in must not render provider buttons when framed (PROTOCOL §4.1).
 * A cross-origin `window.top` can still be compared; any error counts as framed.
 */
export function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

/** "Who is asking" (PROTOCOL §4.2, SPEC §5.4). */
export function RequesterBox({ requester }: { requester: Requester }) {
  let label: string;
  let value: ReactNode;
  switch (requester.kind) {
    case "web":
      label = "Requested by";
      value = <span className="requester-value" data-testid="requester">{requester.origin}</span>;
      break;
    case "redirect":
      label = "Requested by";
      value = (
        <>
          <span className="requester-value" data-testid="requester">{requester.host}</span>
          <span style={{ display: "block", fontSize: "0.9rem" }}>
            You’ll return to <strong>{requester.host}</strong> afterwards.
          </span>
        </>
      );
      break;
    case "native":
      label = requester.delivery === "paste" ? "Requested by an app on another device" : "Requested by an app on this computer";
      value = requester.appName ? (
        <span className="requester-value" data-testid="requester">
          <span className="says">says it is </span>“{requester.appName}”
        </span>
      ) : (
        <span className="requester-value" data-testid="requester">
          <span className="says">An app that didn’t give its name</span>
        </span>
      );
      break;
  }
  return (
    <div className="requester">
      <ShieldIcon size={20} />
      <div>
        <div className="requester-label">{label}</div>
        {value}
      </div>
    </div>
  );
}

/** Consent text from SPEC §5.4, naming each target. */
export function ConsentText({ targets, infos }: { targets: Target[]; infos: TargetInfo[] | null }) {
  return (
    <p className="consent-text" data-testid="consent-text">
      An app wants to know whether you sponsor{" "}
      {targets.map((t, i) => {
        const info = findInfo(t, infos);
        const name = t.provider === "github" ? `@${t.account}` : (info?.displayName ?? t.account);
        return (
          <Fragment key={`${t.provider}:${t.account}`}>
            {i > 0 ? (i === targets.length - 1 ? " and " : ", ") : null}
            <strong>{name}</strong> on {PROVIDER_SHORT[t.provider]}
          </Fragment>
        );
      })}
      . It will see the amount, frequency and status of those contributions only, including private ones. Nothing else about your
      account is shared, and Sponsorkit stores nothing.
    </p>
  );
}

export function Consent({
  params,
  targetsState,
  continueValue,
  heading,
}: {
  params: SignInParams;
  targetsState: TargetsState & { retry: () => void };
  /** `/checkout` passes its continue value (PROTOCOL §4.6 step 1). */
  continueValue?: string;
  heading?: string;
}) {
  const infos = targetsState.status === "ready" ? targetsState.infos : null;
  const providers: Provider[] = params.provider ? [params.provider] : params.targets.map((t) => t.provider);
  const title = heading ?? (params.add ? "Connect another account" : "Check your sponsorship");

  return (
    <section className="panel" aria-labelledby="consent-title">
      <h1 id="consent-title">{title}</h1>
      <p className="muted">
        {params.add
          ? "Sign in with another account so the app can see contributions made from it too."
          : "Sign in so the app can see whether you support these projects."}
      </p>

      <RequesterBox requester={requesterOf(params)} />

      <ul className="target-list" aria-label="Accounts that will be checked" aria-busy={targetsState.status === "loading"}>
        {params.targets.map((t) => (
          <TargetRow key={`${t.provider}:${t.account}`} target={t} info={findInfo(t, infos)} loading={targetsState.status === "loading"} />
        ))}
      </ul>

      {targetsState.status === "error" ? (
        <div className="alert alert-warn" role="status">
          <AlertIcon size={18} />
          <p>
            {targetsState.message} The account names above come from the link and couldn’t be verified.{" "}
            <button type="button" className="btn btn-secondary" style={{ minHeight: 0, padding: "0.2rem 0.6rem", marginLeft: "0.25rem" }} onClick={targetsState.retry}>
              Retry
            </button>
          </p>
        </div>
      ) : null}

      <ConsentText targets={params.targets} infos={infos} />

      {isFramed() ? (
        <div className="alert alert-warn" role="status" data-testid="framed">
          <AlertIcon size={18} />
          <p>
            For your safety, sign-in can’t start inside another page.{" "}
            <a href={window.location.href} target="_blank" rel="noopener noreferrer" data-testid="open-top-level">
              Open this page in a new window
            </a>{" "}
            to continue.
          </p>
        </div>
      ) : (
        <div className="actions">
          {providers.map((p) => {
            // A top-level form POST, so the browser sends this site's Origin (PROTOCOL §4.2 step 3, §4.3).
            const form = buildStartForm(apiBase(), p, params, continueValue);
            return (
              <form
                key={p}
                className="start-form"
                method="post"
                action={form.action}
                encType="application/x-www-form-urlencoded"
                target="_self"
                data-testid={`start-form-${p}`}
              >
                {form.fields.map(([name, value]) => (
                  <input key={name} type="hidden" name={name} value={value} />
                ))}
                <button type="submit" className={`btn btn-block btn-${p}`} data-testid={`continue-${p}`}>
                  <ProviderIcon provider={p} size={20} />
                  {BUTTON_LABEL[p]}
                </button>
              </form>
            );
          })}
        </div>
      )}
      <p className="fineprint">
        You’ll sign in on {providers.map((p) => PROVIDER_SHORT[p]).join(" or ")}. Sponsorkit never sees your password and keeps no record of you.
      </p>
    </section>
  );
}

export function InvalidLink({ errors, title = "This link doesn’t work" }: { errors: string[]; title?: string }) {
  return (
    <section className="panel" aria-labelledby="invalid-title">
      <div className="status-icon error">
        <AlertIcon size={24} />
      </div>
      <h1 id="invalid-title">{title}</h1>
      <p className="muted">The app that sent you here built an invalid link. Nothing was shared. Go back to the app and try again.</p>
      <div className="alert alert-error" role="alert">
        <AlertIcon size={18} />
        <ul style={{ margin: 0, paddingLeft: "1rem" }} data-testid="errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <section className="panel" aria-busy="true" aria-live="polite">
      <p style={{ display: "flex", alignItems: "center", gap: "0.6rem", margin: 0 }} className="muted">
        <span className="spinner" aria-hidden="true" />
        {label}
      </p>
    </section>
  );
}
