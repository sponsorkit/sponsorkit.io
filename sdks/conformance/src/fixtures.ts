import { z } from "zod";
import { Contribution, TargetInfo, TargetsResponse, type Provider } from "@sponsorkit/shared";
import contributionsJson from "../fixtures/contributions.json";
import targetsJson from "../fixtures/targets-response.json";

/** The target set every scenario uses unless it says otherwise. */
export const DEFAULT_TARGETS = { github: "sponsorkit-conformance", opencollective: "sponsorkit-conformance" } as const;
export const DEFAULT_TARGETS_PARAM = "github:sponsorkit-conformance,opencollective:sponsorkit-conformance";
/** An account that is well-formed but does not exist (TargetInfo.exists === false). */
export const MISSING_GITHUB_ACCOUNT = "sponsorkit-conformance-missing";

const ContributionsFixture = z.object({
  defaultPool: z.array(z.string()),
  contributions: z.record(z.string(), Contribution),
});

const contributionsFixture = ContributionsFixture.parse(contributionsJson);

/** Named contribution fixtures (fixtures/contributions.json). */
export const NAMED_CONTRIBUTIONS: Readonly<Record<string, Contribution>> = contributionsFixture.contributions;
export type ContributionName = keyof typeof contributionsJson.contributions;

export function namedContribution(name: string): Contribution {
  const c = NAMED_CONTRIBUTIONS[name];
  if (!c) throw new Error(`Unknown contribution fixture "${name}"`);
  return structuredClone(c);
}

/** Contributions the fake server serves when no scenario overrides them. */
export function defaultPool(): Contribution[] {
  return contributionsFixture.defaultPool.map(namedContribution);
}

/** Target metadata for accounts the fake server knows (fixtures/targets-response.json). */
export const KNOWN_TARGETS: ReadonlyMap<string, TargetInfo> = new Map(
  TargetsResponse.parse(targetsJson).targets.map((t) => [t.target, t]),
);

/** TargetInfo for any target: the fixture when known, otherwise a non-existent target. */
export function targetInfo(provider: Provider, account: string): TargetInfo {
  const key = `${provider}:${account}`;
  const known = KNOWN_TARGETS.get(key);
  if (known) return structuredClone(known);
  return {
    target: key,
    provider,
    account,
    exists: false,
    displayName: null,
    avatarUrl: null,
    url: null,
    currency: null,
    frequencies: [],
    customAmount: false,
    tiers: [],
  };
}

/** The identities the fake provider OAuth "signs in" as. Deterministic so scenarios can assert on them. */
export const FAKE_IDENTITIES: Readonly<Record<Provider, { provider: Provider; id: string; handle: string }>> = {
  github: { provider: "github", id: "583231", handle: "conformance-user" },
  opencollective: { provider: "opencollective", id: "rvelxbzm-o9n8y05w-wq9op3dg", handle: "conformance-user" },
};
