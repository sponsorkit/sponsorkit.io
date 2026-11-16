/** Type-level check (via `tsc`) that the self-contained public types match @sponsorkit/shared. */
import { expect, test } from "bun:test";
import type * as Shared from "@sponsorkit/shared";
import type * as Ours from "../../src/types";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>(): T => true as T;

test("public types mirror the canonical schemas", () => {
  expect([
    assert<Equal<Ours.Contribution, Shared.Contribution>>(),
    assert<Equal<Ours.ContributionResult, Shared.ContributionResult>>(),
    assert<Equal<Ours.TargetInfo, Shared.TargetInfo>>(),
    assert<Equal<Ours.Identity, Shared.Identity>>(),
    assert<Equal<Ours.Provider, Shared.Provider>>(),
    assert<Equal<Ours.Frequency, Shared.Frequency>>(),
    assert<Equal<Ours.ContributionStatus, Shared.Status>>(),
  ]).toEqual([true, true, true, true, true, true, true]);
});
