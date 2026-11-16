/**
 * Schema of scenarios.json. README.md explains the semantics of every field;
 * scripts/generate.ts also emits it as JSON Schema (scenarios.schema.json) for
 * SDKs in other languages.
 */
import { z } from "zod";
import { Contribution, Frequency, Provider } from "@sponsorkit/shared";
import { ControlOptions, ControlPatch, MintSessionRequest } from "./control";

/** Error codes an SDK's SponsorkitError may carry in these scenarios. */
export const SDK_ERROR_CODES = [
  "invalid_config",
  "disabled",
  "popup_blocked",
  "access_denied",
  "invalid_state",
  "provider_error",
  "invalid_code",
  "cancelled",
  "timeout",
  "network_error",
  "session_invalid",
  "targets_mismatch",
] as const;
export const SdkErrorCode = z.enum(SDK_ERROR_CODES);

/** Test hooks / capabilities a scenario needs (README "Required SDK test hooks"). */
export const HOOKS = [
  "apiBaseUrl",
  "storageDir",
  "openBrowser",
  "promptForCode",
  "signInMethod",
  "env",
  "devChecks",
  "checkoutPollInterval",
  "restart",
  "posixPermissions",
  "signInTimeout",
  "interactive",
  "cancellation",
  "processEnv",
] as const;
export const Hook = z.enum(HOOKS);

/** A matcher: any JSON value, optionally using the `$`-operators described in README.md. */
export const Matcher = z.unknown();

export const RequestCall = z
  .object({
    method: z.enum(["GET", "POST", "PATCH", "DELETE", "OPTIONS"]),
    path: z.string().startsWith("/"),
    count: z.number().int().nonnegative().optional(),
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
    query: Matcher.optional(),
    headers: Matcher.optional(),
    body: Matcher.optional(),
  })
  .strict();

export const RequestExpectation = z
  .object({
    /** When true (default) every logged request must be matched by some entry of `calls`. */
    exact: z.boolean().default(true),
    /** When false (default) `GET /api/v1/targets` requests are ignored entirely (dev-time existence checks). */
    includeTargetsLookups: z.boolean().default(false),
    calls: z.array(RequestCall).default([]),
  })
  .strict();

export const StepExpect = z
  .object({
    /** Matcher applied to the step's return value (normalized as described in README). */
    returns: Matcher.optional(),
    /** The step must throw/reject with a SponsorkitError of this code. */
    throws: SdkErrorCode.optional(),
    /**
     * Matcher applied to the normalized thrown error `{ code, retryAfter }` (retryAfter: seconds or null).
     * Only checked when the step threw.
     */
    error: Matcher.optional(),
    /** Unordered: the ids of `returns.contributions` (or of the checkout `contribution`) must equal this set. */
    contributionIds: z.array(z.string()).optional(),
    /** Requests the server received while this step ran. */
    requests: RequestExpectation.optional(),
    /** Wall-clock bounds for the step. */
    minSeconds: z.number().nonnegative().optional(),
    maxSeconds: z.number().positive().optional(),
  })
  .strict();

export const MockOption = z.union([z.string(), z.object({ contributions: z.array(Contribution) }).strict()]);

export const ConfigureArgs = z
  .object({
    github: z.string().optional(),
    opencollective: z.string().optional(),
    appName: z.string().optional(),
    cacheTtl: z.number().int().nonnegative().optional(),
    mock: MockOption.optional(),
    apiBaseUrl: z.string().default("$BASE_URL"),
    storageDir: z.string().default("$STORAGE_DIR"),
    signInMethod: z.enum(["auto", "loopback", "paste"]).optional(),
    /**
     * The per-instance `env` override (PROTOCOL §7). It always **replaces** the process environment
     * for SPONSORKIT_DISABLE, SPONSORKIT_MOCK, SPONSORKIT_NO_NAG, SPONSORKIT_DEV_CHECKS and CI.
     */
    env: z.record(z.string(), z.string()).default({}),
    /**
     * Variables the harness sets in the real process environment before constructing the instance
     * and keeps set until the scenario ends (then restores). Used to prove that `env` replaces them.
     */
    processEnv: z.record(z.string(), z.string()).optional(),
    /** Forces dev-time checks (target existence via /targets) on or off. Absent: the SDK default (PROTOCOL §7). */
    devChecks: z.boolean().optional(),
    /** `signInTimeout`, seconds (production default 300). */
    signInTimeout: z.number().positive().optional(),
    /** Overrides the TTY detection used by the nag helper. Absent: the SDK default (TTY detection). */
    interactive: z.boolean().optional(),
  })
  .strict();

export const CheckoutArgs = z
  .object({
    provider: Provider.optional(),
    amount: z.number().int().positive().optional(),
    currency: z.string().optional(),
    frequency: Frequency.optional(),
    /** openCheckout `timeout`, seconds. */
    timeout: z.number().positive().optional(),
    /** Test hook: seconds between polls (production: 60). */
    pollInterval: z.number().positive().optional(),
    /** Fire the cancellation signal this many seconds after the call starts. */
    cancelAfter: z.number().nonnegative().optional(),
  })
  .strict();

const TargetOptions = z.object({ github: z.string().optional(), opencollective: z.string().optional() }).strict();

const step = <A extends string, S extends z.ZodType>(action: A, args: S) =>
  z
    .object({
      action: z.literal(action),
      args,
      note: z.string().optional(),
      expect: StepExpect.optional(),
    })
    .strict();

const bareStep = <A extends string>(action: A) =>
  z
    .object({
      action: z.literal(action),
      note: z.string().optional(),
      expect: StepExpect.optional(),
    })
    .strict();

export const SimpleStep = z.discriminatedUnion("action", [
  step("configure", ConfigureArgs),
  bareStep("restart"),
  step(
    "signIn",
    z
      .object({
        method: z.enum(["loopback", "paste"]),
        provider: Provider.optional(),
        /** Fire the sign-in cancellation signal this many seconds after the call starts. */
        cancelAfter: z.number().nonnegative().optional(),
      })
      .strict(),
  ),
  bareStep("isSignedIn"),
  step("getFinancialContribution", z.object({ cacheTtl: z.number().int().nonnegative().optional() }).strict().default({})),
  step("openCheckout", CheckoutArgs.extend({ method: z.enum(["loopback", "paste"]).optional() }).strict()),
  step(
    "checkoutUrl",
    z
      .object({
        // Deliberately loose: scenarios pass invalid values to assert invalid_config.
        provider: z.string().optional(),
        amount: z.number().optional(),
        currency: z.string().optional(),
        frequency: z.string().optional(),
      })
      .strict(),
  ),
  bareStep("signOut"),
  step(
    "nagDue",
    z
      .object({
        id: z.string(),
        every: z.number().int().positive(),
        orEvery: z.string().optional(),
        predicate: z.enum(["always", "never", "noActive"]),
        force: z.boolean().default(false),
      })
      .strict(),
  ),
  step("nagShown", z.object({ id: z.string() }).strict()),
  step(
    "verifySession",
    z.object({ token: z.string(), targets: TargetOptions, apiBaseUrl: z.string().default("$BASE_URL") }).strict(),
  ),
  step("control", ControlPatch),
  step("mintSession", MintSessionRequest),
  step("writeStorage", z.object({ path: z.string().default("$STORAGE_FILE"), json: z.unknown() }).strict()),
  step("wait", z.object({ seconds: z.number().positive() }).strict()),
]);

export const Step = z.union([
  SimpleStep,
  z
    .object({
      action: z.literal("parallel"),
      args: z.object({ instances: z.number().int().min(2), step: SimpleStep }).strict(),
      note: z.string().optional(),
      expect: StepExpect.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("group"),
      steps: z.array(SimpleStep).min(1),
      note: z.string().optional(),
      expect: StepExpect.optional(),
    })
    .strict(),
]);
export type Step = z.input<typeof Step>;

export const FileExpectation = z.union([
  z
    .object({
      path: z.string(),
      /** "optional": the file may be absent; other assertions apply only if it exists. */
      exists: z.union([z.boolean(), z.literal("optional")]),
      kind: z.enum(["file", "directory"]).optional(),
      /** POSIX permission bits, octal string. Skipped on Windows. */
      mode: z.string().regex(/^0[0-7]{3}$/).optional(),
      /** Matcher applied to the parsed JSON content. */
      json: Matcher.optional(),
      /** The file must validate against this schema (storage-file.schema.json). */
      schema: z.literal("storage-file").optional(),
    })
    .strict(),
  z.object({ glob: z.string(), count: z.number().int().nonnegative() }).strict(),
]);

export const Scenario = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string(),
    description: z.string(),
    category: z.enum(["config", "mock", "sign-in", "session", "cache", "checkout", "nag", "storage", "server-helper"]),
    specRefs: z.array(z.string()).min(1),
    requires: z.array(Hook).default([]),
    /** Control payload applied with POST /__control {scenario: id} before the first step. */
    server: ControlOptions.default({}),
    steps: z.array(Step).min(1),
    /** Assertions after the last step. */
    expect: z
      .object({
        files: z.array(FileExpectation).optional(),
        requests: RequestExpectation.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Scenario = z.input<typeof Scenario>;

export const ScenariosFile = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    variables: z.record(z.string().regex(/^\$[A-Z][A-Z0-9_]*$/), z.string()),
    defaults: z.object({ targets: TargetOptions, appName: z.string() }).strict(),
    scenarios: z.array(Scenario),
  })
  .strict();
export type ScenariosFile = z.input<typeof ScenariosFile>;
