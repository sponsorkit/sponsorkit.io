/** PROTOCOL §6: checkout eligibility and provider redirect URLs. */
import type { Frequency, Provider, TargetInfo, TargetTier } from "@sponsorkit/shared";

export interface CheckoutOptions {
  amount?: number;
  currency?: string;
  frequency?: Frequency;
}

export type Eligibility = { provider: Provider; eligible: true; url: string } | { provider: Provider; eligible: false; reason: string };

function githubTiers(info: TargetInfo, frequency: Frequency | undefined): TargetTier[] {
  const f = frequency ?? "monthly";
  return info.tiers.filter((t) => t.frequency === f);
}

/** Major units for the Open Collective `amount` query parameter: 500 -> "5", 550 -> "5.5". */
export function majorUnits(minor: number): string {
  return String(minor / 100);
}

export function providerRedirectUrl(info: TargetInfo, opts: CheckoutOptions, siteBaseUrl: string): string {
  if (info.provider === "github") {
    const tiers = githubTiers(info, opts.frequency).sort((a, b) => a.amount.value - b.amount.value);
    if (tiers.length === 0) return `https://github.com/sponsors/${info.account}`;
    const wanted = opts.amount ?? 0;
    const tier = tiers.find((t) => t.amount.value >= wanted) ?? tiers[tiers.length - 1]!;
    return tier.url ?? `https://github.com/sponsors/${info.account}/sponsorships?tier_id=${encodeURIComponent(tier.id)}`;
  }
  const q = new URLSearchParams();
  if (opts.amount !== undefined) q.set("amount", majorUnits(opts.amount));
  if (opts.frequency === "monthly") q.set("interval", "month");
  if (opts.frequency === "yearly") q.set("interval", "year");
  q.set("redirect", `${siteBaseUrl}/checkout/thanks/`);
  return `https://opencollective.com/${info.account}/donate?${q.toString()}`;
}

export function eligibility(info: TargetInfo, opts: CheckoutOptions, siteBaseUrl: string): Eligibility {
  const provider = info.provider;
  if (!info.exists) return { provider, eligible: false, reason: `${info.target} does not exist` };
  if (opts.frequency && !info.frequencies.includes(opts.frequency))
    return { provider, eligible: false, reason: `${info.target} does not accept ${opts.frequency} contributions` };
  if (opts.currency && opts.currency !== info.currency)
    return { provider, eligible: false, reason: `${info.target} only accepts ${info.currency ?? "no currency"}` };
  if (provider === "github" && githubTiers(info, opts.frequency).length === 0)
    return { provider, eligible: false, reason: `${info.target} has no ${opts.frequency ?? "monthly"} tier` };
  return { provider, eligible: true, url: providerRedirectUrl(info, opts, siteBaseUrl) };
}
