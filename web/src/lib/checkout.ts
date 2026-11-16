/**
 * Checkout eligibility and provider redirect URLs (PROTOCOL §6).
 *
 * Pure and deterministic: the page passes in `/api/v1/targets` data and its own origin.
 */
import type { Frequency, Provider, Target, TargetInfo, TargetTier } from "@sponsorkit/shared";

export interface CheckoutOptions {
  /** Minor units. */
  amount?: number;
  /** ISO 4217, uppercase. */
  currency?: string;
  frequency?: Frequency;
}

export type IneligibleCode = "not_found" | "frequency" | "currency" | "no_tiers";

export interface IneligibleReason {
  code: IneligibleCode;
  message: string;
}

export interface ProviderOption {
  provider: Provider;
  /** Target string, e.g. `github:octocat`. */
  target: string;
  /** Null when `/targets` returned nothing for this target. */
  info: TargetInfo | null;
  eligible: boolean;
  reasons: IneligibleReason[];
  /** Redirect URL when eligible. */
  url: string | null;
}

export type CheckoutPlan =
  | { action: "redirect"; provider: Provider; url: string; options: ProviderOption[] }
  | {
      action: "choose";
      options: ProviderOption[];
      /** The `provider` param was given but isn't eligible. */
      preferredUnavailable: Provider | null;
    };

export const PROVIDER_LABEL: Record<Provider, string> = {
  github: "GitHub Sponsors",
  opencollective: "Open Collective",
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  one_time: "one-time",
  monthly: "monthly",
  yearly: "yearly",
};

/** GitHub Sponsors always charges USD (PROTOCOL §6 rule 3). */
function effectiveCurrency(info: TargetInfo): string | null {
  if (info.provider === "github") return "USD";
  return info.currency ? info.currency.toUpperCase() : null;
}

function tiersFor(info: TargetInfo, frequency: Frequency | undefined): TargetTier[] {
  const f = frequency ?? "monthly";
  return info.tiers.filter((t) => t.frequency === f);
}

/** Apply the §6 eligibility rules to one target. All failing rules are reported. */
export function evaluateTarget(info: TargetInfo, opts: CheckoutOptions): { eligible: boolean; reasons: IneligibleReason[] } {
  const label = PROVIDER_LABEL[info.provider];
  if (!info.exists) {
    const what = info.provider === "github" ? `@${info.account}` : `“${info.account}”`;
    return {
      eligible: false,
      reasons: [{ code: "not_found", message: `${what} wasn't found on ${label}.` }],
    };
  }
  const reasons: IneligibleReason[] = [];
  if (opts.frequency && !info.frequencies.includes(opts.frequency)) {
    reasons.push({
      code: "frequency",
      message: `${label} doesn't support ${FREQUENCY_LABEL[opts.frequency]} contributions here.`,
    });
  }
  if (opts.currency) {
    const cur = effectiveCurrency(info);
    if (cur !== opts.currency.toUpperCase()) {
      reasons.push({
        code: "currency",
        message: cur
          ? `Only accepts ${cur}, not ${opts.currency.toUpperCase()}.`
          : `Its currency is unknown, so ${opts.currency.toUpperCase()} can't be guaranteed.`,
      });
    }
  }
  if (info.provider === "github" && tiersFor(info, opts.frequency).length === 0) {
    // Only meaningful when the frequency itself is supported; otherwise the frequency reason says it all.
    if (!reasons.some((r) => r.code === "frequency")) {
      reasons.push({
        code: "no_tiers",
        message: `This GitHub Sponsors profile has no ${FREQUENCY_LABEL[opts.frequency ?? "monthly"]} tiers.`,
      });
    }
  }
  return { eligible: reasons.length === 0, reasons };
}

/**
 * GitHub tier choice (PROTOCOL §6): the cheapest tier with `amount.value >= amount` for the
 * frequency (or monthly), otherwise the highest tier. Without an amount, the cheapest tier.
 */
export function selectGitHubTier(info: TargetInfo, opts: CheckoutOptions): TargetTier | null {
  const tiers = [...tiersFor(info, opts.frequency)].sort((a, b) => a.amount.value - b.amount.value);
  if (tiers.length === 0) return null;
  const min = opts.amount ?? 0;
  return tiers.find((t) => t.amount.value >= min) ?? tiers[tiers.length - 1] ?? null;
}

export function githubCheckoutUrl(info: TargetInfo, opts: CheckoutOptions): string {
  const login = encodeURIComponent(info.account);
  const base = `https://github.com/sponsors/${login}`;
  const tier = selectGitHubTier(info, opts);
  if (!tier) return base;
  // Only the Worker builds `?tier_id=` links (from a decoded databaseId); `tier.id` is an opaque
  // node id, so clients never build one themselves (PROTOCOL §6).
  return tier.url ?? base;
}

/**
 * ISO 4217 minor-unit digits for currencies that don't use 2. Deliberately a static table:
 * `Intl`'s `maximumFractionDigits` follows CLDR display rules, which differ from ISO 4217 for
 * e.g. HUF, IDR, COP, PKR (ISO 2) and IQD (ISO 3), and PROTOCOL §6 requires ISO 4217.
 */
const ISO_4217_EXPONENTS: Readonly<Record<string, number>> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0,
  UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  CLF: 4, UYW: 4,
};

/** Number of ISO 4217 minor-unit digits for a currency (USD → 2, JPY → 0, KWD → 3). Falls back to 2. */
export function currencyExponent(currency: string): number {
  return ISO_4217_EXPONENTS[currency.toUpperCase()] ?? 2;
}

/** Minor units → major-unit string without trailing zeros: 500 → "5", 550 → "5.5", 1999 → "19.99". */
export function toMajorUnits(minor: number, currency: string): string {
  const exp = currencyExponent(currency);
  const negative = minor < 0;
  const digits = String(Math.abs(Math.trunc(minor))).padStart(exp + 1, "0");
  const whole = exp === 0 ? digits : digits.slice(0, -exp);
  const frac = exp === 0 ? "" : digits.slice(-exp).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Human-readable money, e.g. `formatMoney(500, "USD", "en-US")` → "$5". Minor units in. */
export function formatMoney(minor: number, currency: string, locale?: string): string {
  const exp = currencyExponent(currency);
  const major = minor / 10 ** exp;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(major) ? 0 : exp,
      maximumFractionDigits: exp,
    }).format(major);
  } catch {
    return `${toMajorUnits(minor, currency)} ${currency}`;
  }
}

/** One-line description of what the supporter will be offered at a provider, or null if unknown. */
export function describeOffer(option: ProviderOption, opts: CheckoutOptions, locale?: string): string | null {
  const info = option.info;
  if (!info || !option.eligible) return null;
  const per = opts.frequency === "yearly" ? " a year" : opts.frequency === "one_time" ? " once" : " a month";
  if (info.provider === "github") {
    const tier = selectGitHubTier(info, opts);
    if (!tier) return null;
    const freq = tier.frequency === "one_time" ? " once" : " a month";
    return `${formatMoney(tier.amount.value, tier.amount.currency, locale)}${freq} · ${tier.name}`;
  }
  const currency = opts.currency ?? info.currency;
  if (opts.amount !== undefined && currency) return `${formatMoney(opts.amount, currency, locale)}${per}`;
  return opts.frequency ? `Any amount${per}` : "Any amount, once or recurring";
}

export function openCollectiveCheckoutUrl(info: TargetInfo, opts: CheckoutOptions, sponsorkitOrigin: string): string {
  const q = new URLSearchParams();
  if (opts.amount !== undefined) {
    q.set("amount", toMajorUnits(opts.amount, opts.currency ?? info.currency ?? "USD"));
  }
  if (opts.frequency === "monthly") q.set("interval", "month");
  else if (opts.frequency === "yearly") q.set("interval", "year");
  q.set("redirect", `${sponsorkitOrigin}/checkout/thanks`);
  return `https://opencollective.com/${encodeURIComponent(info.account)}/donate?${q.toString()}`;
}

export function checkoutUrl(info: TargetInfo, opts: CheckoutOptions, sponsorkitOrigin: string): string {
  return info.provider === "github"
    ? githubCheckoutUrl(info, opts)
    : openCollectiveCheckoutUrl(info, opts, sponsorkitOrigin);
}

/**
 * Decide what `/checkout` does (PROTOCOL §4.6 step 2): redirect when the preferred provider is
 * eligible, or when exactly one provider is eligible; otherwise show the chooser.
 */
export function planCheckout(
  targets: Target[],
  infos: TargetInfo[],
  opts: CheckoutOptions & { provider?: Provider },
  sponsorkitOrigin: string,
): CheckoutPlan {
  const options: ProviderOption[] = targets.map((t) => {
    const target = `${t.provider}:${t.account}`;
    const info = infos.find((i) => i.target === target) ?? infos.find((i) => i.provider === t.provider && i.account === t.account) ?? null;
    if (!info) {
      return {
        provider: t.provider,
        target,
        info: null,
        eligible: false,
        reasons: [{ code: "not_found", message: `No details were returned for ${PROVIDER_LABEL[t.provider]}.` }],
        url: null,
      };
    }
    const { eligible, reasons } = evaluateTarget(info, opts);
    return { provider: t.provider, target, info, eligible, reasons, url: eligible ? checkoutUrl(info, opts, sponsorkitOrigin) : null };
  });

  if (opts.provider) {
    const preferred = options.find((o) => o.provider === opts.provider);
    if (preferred?.eligible && preferred.url) {
      return { action: "redirect", provider: preferred.provider, url: preferred.url, options };
    }
  }
  const eligible = options.filter((o) => o.eligible);
  const only = eligible[0];
  if (eligible.length === 1 && only?.url && !opts.provider) {
    return { action: "redirect", provider: only.provider, url: only.url, options };
  }
  return { action: "choose", options, preferredUnavailable: opts.provider ?? null };
}
