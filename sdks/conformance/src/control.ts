/**
 * Behaviour options accepted by `POST /__control` (replace) and `PATCH /__control` (merge).
 * The README documents every field; scenarios.json uses them in each scenario's `server` block.
 */
import { z } from "zod";
import { Contribution, Provider } from "@sponsorkit/shared";

/** A contribution: either a full object or the name of a fixture in fixtures/contributions.json. */
export const ContributionRef = z.union([z.string().min(1), Contribution]);
export type ContributionRef = z.infer<typeof ContributionRef>;

export const FailEndpoint = z.enum(["contributions", "token", "targets", "health"]);
export type FailEndpoint = z.infer<typeof FailEndpoint>;

export const DeliveredError = z.enum(["access_denied", "invalid_state", "provider_error"]);

export const ControlOptions = z
  .object({
    /** Replaces the contribution pool. Only contributions whose provider has an identity in the session and whose target is in the session's target set are returned. */
    contributions: z.array(ContributionRef).optional(),
    /** Providers that "fail upstream": omitted from results, which then carry `stale: true` and `unavailable`. */
    outage: z.array(Provider).optional(),
    /** Identities of these providers are returned with `needsReconnect: true`. */
    needsReconnect: z.array(Provider).optional(),
    /** Respond with a 5xx `internal` problem. `times` omitted = every request. */
    fail: z
      .object({
        status: z.union([z.literal(500), z.literal(502), z.literal(503), z.literal(504)]).default(503),
        endpoints: z.array(FailEndpoint).min(1).default(["contributions"]),
        times: z.number().int().positive().optional(),
      })
      .optional(),
    /** `GET /api/v1/contributions` answers `429 rate_limited` with `Retry-After: <retryAfter>`. `times` omitted = every request. */
    rateLimit: z
      .object({
        retryAfter: z.number().int().nonnegative(),
        times: z.number().int().positive().optional(),
      })
      .optional(),
    /** Every session token is rejected with `401 session_invalid` (as if revoked/expired/sealed with an unknown key). */
    sessionInvalid: z.boolean().optional(),
    /** The next `times` successful `/contributions` responses carry `Sponsorkit-Session` with a newly issued token. Old tokens stay valid (stateless renewal). */
    renewSession: z.object({ times: z.number().int().positive().default(1) }).optional(),
    /**
     * Makes a contribution appear (or replace the one with the same id) in `/contributions` responses
     * once armed and after `afterCalls` successful `/contributions` responses without it.
     * `trigger: "checkout"` arms when the fake provider checkout page is loaded; `"immediate"` arms now.
     * `/auth/token` results never include it.
     */
    newContribution: z
      .object({
        contribution: ContributionRef,
        trigger: z.enum(["checkout", "immediate"]).default("checkout"),
        afterCalls: z.number().int().nonnegative().default(0),
      })
      .optional(),
    /** Non-interactive provider OAuth: which provider "signs in" (default: `provider` param, else first target) or which error is delivered. */
    connect: z
      .object({
        provider: Provider.optional(),
        error: DeliveredError.optional(),
        /**
         * The user never finishes: `/connect/` (and the sign-in half of `/checkout/`) answers `200` HTML
         * and delivers neither a code nor an error. Used for sign-in timeout and cancellation scenarios.
         */
        abandon: z.boolean().optional(),
      })
      .optional(),
    /** `POST /api/v1/auth/token` answers `400 invalid_code` for every code, as if it had expired or the verifier did not match. */
    rejectCodes: z.boolean().optional(),
    /** `/checkout` chooser: when several providers are eligible and none was requested, auto-pick this one instead of rendering the chooser page. */
    checkoutChoice: Provider.optional(),
    /** Delay every `/api/v1/*` response by this many milliseconds. */
    latencyMs: z.number().int().nonnegative().max(60_000).optional(),
  })
  .strict();
export type ControlOptions = z.infer<typeof ControlOptions>;

/**
 * `PATCH /__control` body (and the `control` scenario step): the given keys are
 * merged into the current behaviour; a key set to `null` removes that behaviour.
 */
export const ControlPatch = z
  .object({
    contributions: ControlOptions.shape.contributions.unwrap().nullable().optional(),
    outage: ControlOptions.shape.outage.unwrap().nullable().optional(),
    needsReconnect: ControlOptions.shape.needsReconnect.unwrap().nullable().optional(),
    fail: ControlOptions.shape.fail.unwrap().nullable().optional(),
    rateLimit: ControlOptions.shape.rateLimit.unwrap().nullable().optional(),
    sessionInvalid: ControlOptions.shape.sessionInvalid.unwrap().nullable().optional(),
    renewSession: ControlOptions.shape.renewSession.unwrap().nullable().optional(),
    newContribution: ControlOptions.shape.newContribution.unwrap().nullable().optional(),
    connect: ControlOptions.shape.connect.unwrap().nullable().optional(),
    rejectCodes: ControlOptions.shape.rejectCodes.unwrap().nullable().optional(),
    checkoutChoice: ControlOptions.shape.checkoutChoice.unwrap().nullable().optional(),
    latencyMs: ControlOptions.shape.latencyMs.unwrap().nullable().optional(),
  })
  .strict();
export type ControlPatch = z.infer<typeof ControlPatch>;

/** `POST /__control` body: an optional scenario id (its `server` block is applied first) plus option overrides. */
export const ControlRequest = ControlOptions.extend({ scenario: z.string().min(1).optional() }).strict();
export type ControlRequest = z.infer<typeof ControlRequest>;

/** `POST /__control/sessions` body: mint a session without going through sign-in (for verifySession and storage tests). */
export const MintSessionRequest = z
  .object({
    targets: z.string().min(1),
    identities: z.array(Provider).min(1),
  })
  .strict();
export type MintSessionRequest = z.infer<typeof MintSessionRequest>;
