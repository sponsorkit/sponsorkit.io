/**
 * Reference implementation of the mock-mode rules in fixtures/mock-presets.json
 * (SPEC §7.4). SDKs implement the same expansion in their own language; the
 * expected outputs are pinned in scenarios.json.
 */
import { z } from "zod";
import {
  Contribution,
  ContributionResult,
  Frequency,
  Supporter,
  targetToString,
  type Target,
} from "@sponsorkit/shared";
import presetsJson from "../fixtures/mock-presets.json";

export const MOCK_PRESET_NAMES = ["signed-out", "none", "active-monthly", "one-time", "cancelled", "org"] as const;
export const MockPresetName = z.enum(MOCK_PRESET_NAMES);
export type MockPresetName = z.infer<typeof MockPresetName>;

/** Template contributions have `{provider}` / `{target}` placeholders, so they are validated after expansion. */
const MockPresetsFile = z.object({
  version: z.literal(1),
  rules: z.array(z.string()).min(1),
  supporter: z.unknown(),
  presets: z.record(MockPresetName, z.object({ signedIn: z.boolean(), contributions: z.array(z.unknown()) })),
  checkout: z.unknown(),
});

export const MOCK_PRESETS = MockPresetsFile.parse(presetsJson);

function expand<T>(template: unknown, first: Target): T {
  const provider = first.provider;
  const target = targetToString(first);
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.replaceAll("{provider}", provider).replaceAll("{target}", target);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(template) as T;
}

/** `targets` must already be canonical (see canonicalTargets in @sponsorkit/shared). */
export function mockResult(
  targets: Target[],
  mock: MockPresetName | { contributions: Contribution[] },
): ContributionResult {
  const first = targets[0];
  if (!first) throw new Error("At least one target is required");
  const supporter = Supporter.parse(expand(MOCK_PRESETS.supporter, first));
  const base = {
    disabled: false,
    mock: true,
    targets: targets.map(targetToString),
    fetchedAt: null,
    stale: false,
    fromCache: false,
  };
  if (typeof mock !== "string") {
    return ContributionResult.parse({ ...base, signedIn: true, supporter, contributions: mock.contributions });
  }
  const preset = MOCK_PRESETS.presets[mock];
  const contributions = preset.contributions.map((c) => Contribution.parse(expand(c, first)));
  return ContributionResult.parse({
    ...base,
    signedIn: preset.signedIn,
    supporter: preset.signedIn ? supporter : null,
    contributions,
  });
}

export interface MockCheckoutOptions {
  provider?: string;
  amount?: number;
  currency?: string;
  frequency?: Frequency;
}

/** The contribution `openCheckout()` simulates in mock mode. */
export function mockCheckoutContribution(targets: Target[], opts: MockCheckoutOptions = {}): Contribution {
  const first = targets.find((t) => t.provider === opts.provider) ?? targets[0];
  if (!first) throw new Error("At least one target is required");
  const frequency = opts.frequency ?? "monthly";
  const oneTime = frequency === "one_time";
  return Contribution.parse({
    ...expand<Record<string, unknown>>(MOCK_PRESETS.checkout, first),
    amount: { value: opts.amount ?? 500, currency: opts.currency ?? "USD" },
    frequency,
    kind: oneTime ? "one_time" : "recurring",
    status: oneTime ? "paid" : "active",
  });
}
