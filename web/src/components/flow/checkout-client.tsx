"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Provider, WindowMessage } from "@sponsorkit/shared";
import { describeOffer, FREQUENCY_LABEL, planCheckout, PROVIDER_LABEL, type CheckoutOptions, type CheckoutPlan, type ProviderOption } from "@/lib/checkout";
import { buildContinue, parseCheckoutParams, type CheckoutParams, type ParseResult } from "@/lib/params";
import { browserSiteBaseUrl } from "@/lib/site";
import { AlertIcon, ArrowRightIcon, HeartIcon, ProviderIcon } from "../icons";
import { Consent, InvalidLink, Loading } from "./consent";
import { Avatar, displayName } from "./targets";
import { useTargets } from "./use-targets";

/** Informational message to the opener before leaving (PROTOCOL §4.6 step 3). */
function notifyOpener(origin: string | undefined, provider: Provider): void {
  if (!origin) return;
  const opener = window.opener as Window | null;
  if (!opener || opener === window) return;
  const msg: WindowMessage = { type: "sponsorkit:checkout_redirected", provider };
  try {
    opener.postMessage(msg, origin);
  } catch {
    // The SDK doesn't depend on this message.
  }
}

/** `/checkout/` (PROTOCOL §4.6). */
export function CheckoutClient() {
  const [parsed, setParsed] = useState<ParseResult<CheckoutParams> | null>(null);

  useEffect(() => {
    setParsed(parseCheckoutParams(new URLSearchParams(window.location.search)));
  }, []);

  if (!parsed) return <Loading label="Loading…" />;
  if (!parsed.ok) return <InvalidLink errors={parsed.errors} />;
  if (parsed.value.signIn) return <CheckoutSignIn params={parsed.value} />;
  return <CheckoutChoose params={parsed.value} />;
}

function CheckoutSignIn({ params }: { params: CheckoutParams }) {
  const signIn = params.signIn!;
  const targetsState = useTargets(params.targets);
  return (
    <Consent
      params={signIn}
      targetsState={targetsState}
      continueValue={buildContinue(params)}
      heading="Sign in, then contribute"
    />
  );
}

function CheckoutChoose({ params }: { params: CheckoutParams }) {
  const targetsState = useTargets(params.targets);
  const opts: CheckoutOptions & { provider?: Provider } = useMemo(
    () => ({
      ...(params.amount !== undefined && { amount: params.amount }),
      ...(params.currency !== undefined && { currency: params.currency }),
      ...(params.frequency !== undefined && { frequency: params.frequency }),
      ...(params.provider !== undefined && { provider: params.provider }),
    }),
    [params],
  );

  const plan: CheckoutPlan | null = useMemo(() => {
    if (targetsState.status !== "ready") return null;
    return planCheckout(params.targets, targetsState.infos, opts, browserSiteBaseUrl());
  }, [targetsState, params.targets, opts]);

  const redirected = useRef(false);
  useEffect(() => {
    if (plan?.action !== "redirect" || redirected.current) return;
    redirected.current = true;
    notifyOpener(params.origin, plan.provider);
    window.location.replace(plan.url);
  }, [plan, params.origin]);

  if (targetsState.status === "loading") return <Loading label="Finding the best way to contribute…" />;

  if (targetsState.status === "error") {
    return (
      <section className="panel" aria-labelledby="checkout-title">
        <h1 id="checkout-title">Couldn’t load checkout</h1>
        <div className="alert alert-error" role="alert">
          <AlertIcon size={18} />
          <p>{targetsState.message}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-block" onClick={targetsState.retry}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (!plan || plan.action === "redirect") {
    const provider = plan?.action === "redirect" ? plan.provider : null;
    return (
      <section className="panel" aria-live="polite" aria-labelledby="checkout-title">
        <h1 id="checkout-title">Taking you to {provider ? PROVIDER_LABEL[provider] : "checkout"}…</h1>
        <p className="muted" style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <span className="spinner" aria-hidden="true" />
          You’ll pay there directly. Sponsorkit never handles money.
        </p>
        {plan?.action === "redirect" ? (
          <p className="small">
            Not redirected? <a href={plan.url}>Continue to {PROVIDER_LABEL[plan.provider]}</a>
          </p>
        ) : null}
      </section>
    );
  }

  return <Chooser plan={plan} params={params} opts={opts} />;
}

/** "a yearly contribution in GBP", or null when the app asked for nothing specific. */
function summary(opts: CheckoutOptions): string | null {
  if (!opts.frequency && !opts.currency) return null;
  const freq = opts.frequency ? `${FREQUENCY_LABEL[opts.frequency]} ` : "";
  return `${freq}contribution${opts.currency ? ` in ${opts.currency}` : ""}`;
}

function Chooser({ plan, params, opts }: { plan: Extract<CheckoutPlan, { action: "choose" }>; params: CheckoutParams; opts: CheckoutOptions }) {
  const anyEligible = plan.options.some((o) => o.eligible);
  const asked = summary(opts);
  return (
    <section className="panel" aria-labelledby="checkout-title">
      <div className="status-icon heart">
        <HeartIcon size={24} />
      </div>
      <h1 id="checkout-title">{anyEligible ? "Choose how to contribute" : "No way to contribute with these options"}</h1>
      <p className="muted">
        {anyEligible
          ? "You’ll pay on the provider’s site. Sponsorkit never handles money."
          : asked
            ? `The app asked for a ${asked}, which none of these accounts accepts right now.`
            : "None of these accounts can accept a contribution right now."}
      </p>
      {plan.preferredUnavailable ? (
        <div className="alert alert-warn" role="status">
          <AlertIcon size={18} />
          <p>{PROVIDER_LABEL[plan.preferredUnavailable]} isn’t available for this contribution. The reason is shown below.</p>
        </div>
      ) : null}
      <ul className="choices" aria-label="Payment providers">
        {plan.options.map((o) => (
          <ChoiceItem key={o.target} option={o} opts={opts} origin={params.origin} />
        ))}
      </ul>
    </section>
  );
}

function ChoiceItem({ option, opts, origin }: { option: ProviderOption; opts: CheckoutOptions; origin: string | undefined }) {
  const target = { provider: option.provider, account: option.target.slice(option.target.indexOf(":") + 1) };
  const offer = describeOffer(option, opts);
  const reasonsId = `reasons-${option.provider}`;
  return (
    <li className="choice" data-eligible={option.eligible} data-testid={`choice-${option.provider}`}>
      <div className="choice-head">
        <Avatar target={target} info={option.info} size={40} />
        <span className="target-text">
          <span className="target-name">{displayName(target, option.info)}</span>
          <span className="target-sub">
            <ProviderIcon provider={option.provider} size={13} style={{ verticalAlign: "-0.1em", marginRight: "0.3rem" }} />
            {PROVIDER_LABEL[option.provider]}
            {offer ? ` · ${offer}` : ""}
          </span>
        </span>
      </div>
      {option.eligible && option.url ? (
        <a
          className={`btn btn-block btn-${option.provider}`}
          href={option.url}
          onClick={() => notifyOpener(origin, option.provider)}
          data-testid={`go-${option.provider}`}
        >
          Continue to {PROVIDER_LABEL[option.provider]}
          <ArrowRightIcon size={18} />
        </a>
      ) : (
        <>
          <p className="small" style={{ margin: 0, fontWeight: 600 }} id={`${reasonsId}-label`}>
            Not available:
          </p>
          <ul className="reasons" id={reasonsId} aria-labelledby={`${reasonsId}-label`} data-testid={`reasons-${option.provider}`}>
            {option.reasons.map((r) => (
              <li key={r.code}>{r.message}</li>
            ))}
          </ul>
        </>
      )}
    </li>
  );
}
