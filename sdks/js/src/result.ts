import type { Contribution, ContributionResult, Provider, Supporter } from "./types";

/**
 * A {@link ContributionResult} with filter helpers (SPEC §7.1).
 *
 * Helpers only filter; they never sum across providers or currencies.
 * `JSON.stringify()` yields exactly the protocol shape.
 */
export class FinancialContribution implements ContributionResult {
  signedIn!: boolean;
  disabled!: boolean;
  mock!: boolean;
  targets!: string[];
  supporter!: Supporter | null;
  contributions!: Contribution[];
  fetchedAt!: string | null;
  stale!: boolean;
  fromCache!: boolean;
  unavailable?: Provider[];

  constructor(result: ContributionResult) {
    Object.assign(this, result);
    if (this.unavailable === undefined) delete this.unavailable;
  }

  /** Contributions with status `active`. */
  active(): Contribution[] {
    return this.contributions.filter((c) => c.status === "active");
  }

  /** Recurring contributions (any status). */
  recurring(): Contribution[] {
    return this.contributions.filter((c) => c.kind === "recurring");
  }

  /** One-time contributions (any status). */
  oneTime(): Contribution[] {
    return this.contributions.filter((c) => c.kind === "one_time");
  }

  /** Contributions on one provider. */
  byProvider(provider: Provider): Contribution[] {
    return this.contributions.filter((c) => c.provider === provider);
  }

  /** Contributions made by the user themselves (excludes `via: "organization"`). */
  direct(): Contribution[] {
    return this.contributions.filter((c) => c.via === "direct");
  }

  /** The plain protocol object. */
  toJSON(): ContributionResult {
    const { ...plain } = this;
    return plain;
  }
}
