/** PROTOCOL §8: the per-target-set storage file `<targets_hash>.json`. */
import { z } from "zod";
import { ContributionResult } from "@sponsorkit/shared";

export const NagState = z.object({
  runs: z.number().int().nonnegative(),
  lastShown: z.iso.datetime({ offset: true }).nullable(),
});

export const StorageFile = z.object({
  v: z.literal(1),
  /** Absent (or null) when signed out. */
  sessionToken: z.string().startsWith("sks_").nullable().optional(),
  cache: z
    .object({
      result: ContributionResult,
      storedAt: z.iso.datetime({ offset: true }),
    })
    .nullable()
    .optional(),
  nags: z.record(z.string(), NagState).optional(),
});
export type StorageFile = z.infer<typeof StorageFile>;
