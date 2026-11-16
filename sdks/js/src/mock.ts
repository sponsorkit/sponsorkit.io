/**
 * Mock mode (SPEC §7.4). The presets are embedded verbatim from
 * `sdks/conformance/fixtures/mock-presets.json` and expanded with its `rules`.
 */
import { SponsorkitError } from "./errors";
import presets from "./mock-presets.json";
import { type Target, targetToString } from "./targets";
import type { CheckoutOptions, Contribution, ContributionResult, MockOption, MockPreset, Supporter } from "./types";

/** Names of the built-in presets. */
export const MOCK_PRESETS: readonly MockPreset[] = ["signed-out", "none", "active-monthly", "one-time", "cancelled", "org"];

/** The embedded preset document (identical to the conformance fixture). */
export const MOCK_PRESET_DATA = presets;

function expand<T>(template: unknown, first: Target): T {
  const provider = first.provider;
  const target = targetToString(first);
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.split("{provider}").join(provider).split("{target}").join(target);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(template) as T;
}

/** Validates a mock option (option or `SPONSORKIT_MOCK` value). Throws `invalid_config` for an unknown preset. */
export function parseMockOption(value: unknown): MockOption | null {
  if (value === undefined || value === null || value === false || value === "") return null;
  if (typeof value === "string") {
    if (!(MOCK_PRESETS as readonly string[]).includes(value)) {
      throw new SponsorkitError("invalid_config", `Unknown mock preset "${value}" (expected one of ${MOCK_PRESETS.join(", ")})`);
    }
    return value as MockPreset;
  }
  if (typeof value === "object" && Array.isArray((value as { contributions?: unknown }).contributions)) {
    return { contributions: (value as { contributions: Contribution[] }).contributions };
  }
  throw new SponsorkitError("invalid_config", "mock must be a preset name or { contributions: [...] }");
}

/** Mutable in-memory mock state, per SDK instance. */
export interface MockState {
  signedIn: boolean;
  contributions: Contribution[];
}

/** Initial state for a mock option. */
export function initialMockState(targets: readonly Target[], mock: MockOption): MockState {
  if (typeof mock !== "string") return { signedIn: true, contributions: [...mock.contributions] };
  const first = targets[0] as Target;
  const preset = presets.presets[mock];
  return { signedIn: preset.signedIn, contributions: expand<Contribution[]>(preset.contributions, first) };
}

/** The result for the current mock state. */
export function mockResult(targets: readonly Target[], state: MockState): ContributionResult {
  const first = targets[0] as Target;
  return {
    signedIn: state.signedIn,
    disabled: false,
    mock: true,
    targets: targets.map(targetToString),
    supporter: state.signedIn ? expand<Supporter>(presets.supporter, first) : null,
    contributions: state.signedIn ? [...state.contributions] : [],
    fetchedAt: null,
    stale: false,
    fromCache: false,
  };
}

/** The contribution `openCheckout()` simulates in mock mode. */
export function mockCheckoutContribution(targets: readonly Target[], opts: CheckoutOptions): Contribution {
  const first = targets.find((t) => t.provider === opts.provider) ?? (targets[0] as Target);
  const frequency = opts.frequency ?? "monthly";
  const oneTime = frequency === "one_time";
  return {
    ...expand<Contribution>(presets.checkout, first),
    amount: { value: opts.amount ?? 500, currency: opts.currency ?? "USD" },
    frequency,
    kind: oneTime ? "one_time" : "recurring",
    status: oneTime ? "paid" : "active",
  };
}
