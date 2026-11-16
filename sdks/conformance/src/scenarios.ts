/**
 * Source of scenarios.json. Edit this file, then run `bun run generate`; a test
 * fails when the committed scenarios.json is out of date.
 */
import type { ContributionResult } from "@sponsorkit/shared";
import { parseTargetString } from "@sponsorkit/shared";
import { DEFAULT_TARGETS, DEFAULT_TARGETS_PARAM, MISSING_GITHUB_ACCOUNT, NAMED_CONTRIBUTIONS } from "./fixtures";
import { mockCheckoutContribution, mockResult, type MockPresetName, MOCK_PRESET_NAMES } from "./mock-presets";
import type { Scenario, ScenariosFile, Step } from "./scenario-schema";

export const DEFAULT_TARGETS_HASH = "3363d36356e472dab64ce744efd4e8bad412dd7f152bfd357ba96aa97180ac0e";
export const GITHUB_ONLY_PARAM = "github:sponsorkit-conformance";
export const GITHUB_ONLY_HASH = "d3831f8e6aefc8e048f18374a230b28dd9e05310c396cdab5b75b6dcce9228f9";
export const OC_ONLY_PARAM = "opencollective:sponsorkit-conformance";
export const APP_NAME = "conformance-app";

const contribution = (name: string) => {
  const c = NAMED_CONTRIBUTIONS[name];
  if (!c) throw new Error(`Unknown contribution fixture ${name}`);
  return c;
};
const id = (name: string) => contribution(name).id;
const GH_DIRECT = id("github-direct-monthly");
const GH_ORG = id("github-org-one-time");
const OC_MONTHLY = id("opencollective-monthly");
const GH_NEW = id("github-checkout-new");
const DEFAULT_TARGET_STRINGS = DEFAULT_TARGETS_PARAM.split(",");
const DEFAULT_TARGET_LIST = DEFAULT_TARGET_STRINGS.map(parseTargetString);

// ------------------------------------------------------------------ matchers

const VERIFIER = { $regex: "^[A-Za-z0-9._~-]{43,128}$" };
const CHALLENGE = { $regex: "^[A-Za-z0-9_-]{43}$" };
const LOOPBACK_URI = { $regex: "^http://(127\\.0\\.0\\.1|\\[::1\\]):[0-9]{1,5}/callback$" };
const ABSENT = { $absent: true };
/** A well-formed token the fake server never issued: it answers 401 session_invalid for it. */
const DEAD_SESSION_TOKEN = "sks_conformance-dead-session-token";

const signedOutResult = (targets = DEFAULT_TARGET_STRINGS, extra: Partial<ContributionResult> = {}) => ({
  $exact: {
    signedIn: false,
    disabled: false,
    mock: false,
    targets,
    supporter: null,
    contributions: [],
    fetchedAt: null,
    stale: false,
    fromCache: false,
    ...extra,
  },
});

const signedInEmptyStale = {
  $exact: {
    signedIn: true,
    disabled: false,
    mock: false,
    targets: DEFAULT_TARGET_STRINGS,
    supporter: null,
    contributions: [],
    fetchedAt: null,
    stale: true,
    fromCache: false,
  },
};

const GH_IDENTITY = { provider: "github", id: "583231", handle: "conformance-user", needsReconnect: false };
const OC_IDENTITY = { provider: "opencollective", id: "rvelxbzm-o9n8y05w-wq9op3dg", handle: "conformance-user", needsReconnect: false };

// ------------------------------------------------------------------ requests

type Call = NonNullable<NonNullable<NonNullable<Step["expect"]>["requests"]>["calls"]>[number];

const connectCall = (query: Record<string, unknown> = {}, count = 1): Call => ({
  method: "GET",
  path: "/connect",
  count,
  query: {
    targets: DEFAULT_TARGETS_PARAM,
    challenge: CHALLENGE,
    delivery: "loopback",
    redirect_uri: LOOPBACK_URI,
    app_name: APP_NAME,
    add: ABSENT,
    ...query,
  },
});

const tokenCall = (body: Record<string, unknown> = {}, count: number | { min?: number; max?: number } = 1): Call => ({
  method: "POST",
  path: "/api/v1/auth/token",
  ...(typeof count === "number" ? { count } : count),
  headers: { "content-type": { $regex: "^application/json" } },
  body: { code: { $regex: "^skc_" }, codeVerifier: VERIFIER, sessionToken: ABSENT, ...body },
});

const contributionsCall = (count: number | { min?: number; max?: number }, token = "$LAST_SESSION_TOKEN"): Call => ({
  method: "GET",
  path: "/api/v1/contributions",
  ...(typeof count === "number" ? { count } : count),
  headers: { authorization: `Bearer ${token}` },
});

const none = { exact: true, calls: [] };
const noneAtAll = { exact: true, includeTargetsLookups: true, calls: [] };

// ------------------------------------------------------------------ steps

const configure = (args: Record<string, unknown> = {}): Step => ({
  action: "configure",
  args: { github: DEFAULT_TARGETS.github, opencollective: DEFAULT_TARGETS.opencollective, appName: APP_NAME, ...args },
});
const restart: Step = { action: "restart", note: "Simulates a new process: drop the SDK instance and create a new one from the last configure args." };
const signInLoopback = (expect?: Step["expect"]): Step => ({ action: "signIn", args: { method: "loopback" }, ...(expect ? { expect } : {}) });
const refresh = (expect?: Step["expect"]): Step => ({ action: "getFinancialContribution", args: { cacheTtl: 0 }, ...(expect ? { expect } : {}) });
const get = (expect?: Step["expect"]): Step => ({ action: "getFinancialContribution", args: {}, ...(expect ? { expect } : {}) });
const isSignedIn = (value: boolean): Step => ({ action: "isSignedIn", expect: { returns: value, requests: none } });
const unreachable = (): Step => configure({ apiBaseUrl: "$UNREACHABLE_BASE_URL" });
const mintGithubSession = (targets = DEFAULT_TARGETS_PARAM): Step => ({
  action: "mintSession",
  args: { targets, identities: ["github"] },
});

const storageFile = (json: unknown, extra: Record<string, unknown> = {}) => ({
  path: "$STORAGE_FILE",
  exists: true as const,
  kind: "file" as const,
  schema: "storage-file" as const,
  json,
  ...extra,
});
const noTmpFiles = { glob: "$STORAGE_DIR/*.tmp", count: 0 };
const noStorageDir = { path: "$STORAGE_DIR", exists: false as const };

const signedOutFile = { path: "$STORAGE_FILE", exists: "optional" as const, schema: "storage-file" as const, json: { sessionToken: ABSENT, cache: ABSENT } };

// ------------------------------------------------------------------ scenarios

const config: Scenario[] = [
  {
    id: "config-no-targets",
    title: "No targets is a configuration error",
    description: "Constructing an SDK instance without any target throws invalid_config synchronously, before any I/O.",
    category: "config",
    specRefs: ["SPEC §7.2", "PROTOCOL §1"],
    steps: [{ action: "configure", args: { appName: APP_NAME }, expect: { throws: "invalid_config", requests: noneAtAll } }],
    expect: { files: [noStorageDir] },
  },
  {
    id: "config-malformed-target",
    title: "Malformed targets are configuration errors",
    description: "Logins/slugs that violate the PROTOCOL §1 patterns throw invalid_config when the instance is constructed.",
    category: "config",
    specRefs: ["SPEC §7.2", "PROTOCOL §1"],
    steps: [
      { action: "configure", args: { github: "-bad-" }, expect: { throws: "invalid_config", requests: noneAtAll } },
      { action: "configure", args: { github: "a".repeat(40) }, expect: { throws: "invalid_config", requests: noneAtAll } },
      { action: "configure", args: { opencollective: "bad slug!" }, expect: { throws: "invalid_config", requests: noneAtAll } },
      { action: "configure", args: { github: "has--double" }, expect: { throws: "invalid_config", requests: noneAtAll } },
    ],
    expect: { files: [noStorageDir] },
  },
  {
    id: "config-normalizes-targets",
    title: "Targets are trimmed, lowercased and canonically ordered",
    description:
      "Accounts are trimmed and lowercased and the target param is sorted (PROTOCOL §1). checkoutUrl() is offline and synchronous and exposes the canonical param.",
    category: "config",
    specRefs: ["PROTOCOL §1", "SPEC §7.3"],
    steps: [
      configure({ github: "  SponsorKit-Conformance ", opencollective: "SPONSORKIT-CONFORMANCE" }),
      {
        action: "checkoutUrl",
        args: {},
        expect: { returns: { $url: { base: "$BASE_URL/checkout", query: { $exact: { targets: DEFAULT_TARGETS_PARAM } } } }, requests: noneAtAll },
      },
    ],
  },
  {
    id: "config-target-missing",
    title: "A target that does not exist is a configuration error (dev-time check)",
    description:
      "With dev checks on, the SDK looks the targets up once via GET /api/v1/targets and throws invalid_config because the target has exists: false. The SDK may throw from the constructor or from the first async operation; the group passes if the first step that throws throws invalid_config. No sign-in is started.",
    category: "config",
    specRefs: ["SPEC §7.2", "PROTOCOL §3.1"],
    requires: ["devChecks"],
    steps: [
      {
        action: "group",
        steps: [
          { action: "configure", args: { github: MISSING_GITHUB_ACCOUNT, appName: APP_NAME, devChecks: true } },
          { action: "signIn", args: { method: "loopback" } },
        ],
        expect: {
          throws: "invalid_config",
          requests: {
            exact: true,
            includeTargetsLookups: true,
            calls: [{ method: "GET", path: "/api/v1/targets", count: 1, query: { $exact: { github: MISSING_GITHUB_ACCOUNT } } }],
          },
        },
      },
    ],
  },
  {
    id: "config-dev-check-once",
    title: "The dev-time existence check runs at most once per process",
    description: "With dev checks on and existing targets, nothing throws and /targets is requested at most once, with both providers in one request.",
    category: "config",
    specRefs: ["SPEC §7.2", "PROTOCOL §3.1"],
    requires: ["devChecks"],
    steps: [
      configure({ devChecks: true }),
      get({ returns: signedOutResult() }),
      get({ returns: signedOutResult() }),
      { action: "checkoutUrl", args: {} },
    ],
    expect: {
      requests: {
        exact: true,
        includeTargetsLookups: true,
        calls: [
          {
            method: "GET",
            path: "/api/v1/targets",
            max: 1,
            query: { $exact: { github: DEFAULT_TARGETS.github, opencollective: DEFAULT_TARGETS.opencollective } },
          },
        ],
      },
    },
  },
  {
    id: "config-dev-checks-env",
    title: "SPONSORKIT_DEV_CHECKS turns the dev-time existence check on",
    description:
      "Without the devChecks option, the check is on when SPONSORKIT_DEV_CHECKS is set (PROTOCOL §7, devChecks default). The first async call looks the target up once and throws invalid_config because it does not exist.",
    category: "config",
    specRefs: ["PROTOCOL §7", "PROTOCOL §7.1"],
    requires: ["env", "devChecks"],
    steps: [
      {
        action: "group",
        steps: [
          { action: "configure", args: { github: MISSING_GITHUB_ACCOUNT, appName: APP_NAME, env: { SPONSORKIT_DEV_CHECKS: "1" } } },
          { action: "getFinancialContribution", args: {} },
        ],
        expect: {
          throws: "invalid_config",
          requests: {
            exact: true,
            includeTargetsLookups: true,
            calls: [{ method: "GET", path: "/api/v1/targets", count: 1, query: { $exact: { github: MISSING_GITHUB_ACCOUNT } } }],
          },
        },
      },
    ],
    expect: { files: [noStorageDir] },
  },
  {
    id: "config-dev-checks-default-off",
    title: "Dev-time checks are off by default and the devChecks option wins over the environment",
    description:
      "With env {} (and no implicit development signal in the harness process), no /targets lookup happens, even for a target that does not exist. SPONSORKIT_DEV_CHECKS=0 counts as unset, and devChecks: false beats SPONSORKIT_DEV_CHECKS=1.",
    category: "config",
    specRefs: ["PROTOCOL §7"],
    requires: ["env", "devChecks"],
    steps: [
      { action: "configure", args: { github: MISSING_GITHUB_ACCOUNT, appName: APP_NAME, env: {} } },
      get({ returns: signedOutResult([`github:${MISSING_GITHUB_ACCOUNT}`]), requests: noneAtAll }),
      { action: "configure", args: { github: MISSING_GITHUB_ACCOUNT, appName: APP_NAME, env: { SPONSORKIT_DEV_CHECKS: "0" } } },
      get({ returns: signedOutResult([`github:${MISSING_GITHUB_ACCOUNT}`]), requests: noneAtAll }),
      { action: "configure", args: { github: MISSING_GITHUB_ACCOUNT, appName: APP_NAME, env: { SPONSORKIT_DEV_CHECKS: "1" }, devChecks: false } },
      get({ returns: signedOutResult([`github:${MISSING_GITHUB_ACCOUNT}`]), requests: noneAtAll }),
    ],
    expect: { files: [noStorageDir], requests: noneAtAll },
  },
  {
    id: "config-env-replaces-process-env",
    title: "The env override replaces the process environment",
    description:
      "The harness sets SPONSORKIT_DISABLE=1, SPONSORKIT_MOCK=org and CI=true in the real process environment. An instance constructed with env {} sees none of them: it is neither disabled nor mocked, and a non-forced nag in an interactive terminal is due.",
    category: "config",
    specRefs: ["PROTOCOL §7"],
    requires: ["env", "processEnv", "interactive"],
    steps: [
      configure({ processEnv: { SPONSORKIT_DISABLE: "1", SPONSORKIT_MOCK: "org", CI: "true" }, env: {}, interactive: true }),
      get({ returns: signedOutResult(), requests: noneAtAll }),
      { action: "nagDue", args: { id: "conformance", every: 1, predicate: "always", force: false }, expect: { returns: true, requests: none } },
    ],
    expect: { requests: noneAtAll },
  },
  {
    id: "config-cache-ttl-minimum",
    title: "A constructor cacheTtl below 60 is raised to 60",
    description:
      "configure({ cacheTtl: 1 }) behaves like cacheTtl 60: two seconds after sign-in the token result is still served from the cache. A per-call cacheTtl is not clamped: cacheTtl: 1 per call refreshes.",
    category: "cache",
    specRefs: ["PROTOCOL §7.1"],
    requires: ["openBrowser", "signInMethod"],
    steps: [
      configure({ cacheTtl: 1 }),
      signInLoopback(),
      { action: "wait", args: { seconds: 2.2 } },
      get({ returns: { signedIn: true, fromCache: true }, contributionIds: [GH_DIRECT, GH_ORG], requests: none }),
      {
        action: "getFinancialContribution",
        args: { cacheTtl: 1 },
        expect: { returns: { signedIn: true, fromCache: false }, contributionIds: [GH_DIRECT, GH_ORG], requests: { calls: [contributionsCall(1)] } },
      },
    ],
  },
  {
    id: "disabled-env",
    title: "SPONSORKIT_DISABLE=1 turns the SDK into a no-op",
    description:
      "No network and no disk access, even with dev checks on. getFinancialContribution returns the disabled shape, nag.due() is false even when forced, and signIn/openCheckout reject with disabled.",
    category: "config",
    specRefs: ["SPEC §7.2", "SPEC §7.5"],
    requires: ["env"],
    steps: [
      configure({ env: { SPONSORKIT_DISABLE: "1" }, devChecks: true }),
      get({ returns: signedOutResult(DEFAULT_TARGET_STRINGS, { disabled: true }) }),
      { action: "isSignedIn", expect: { returns: false } },
      { action: "signIn", args: { method: "loopback" }, expect: { throws: "disabled" } },
      { action: "openCheckout", args: { provider: "github", timeout: 2, pollInterval: 1 }, expect: { throws: "disabled", maxSeconds: 1 } },
      { action: "nagDue", args: { id: "conformance", every: 1, predicate: "always", force: true }, expect: { returns: false } },
    ],
    expect: { files: [noStorageDir], requests: noneAtAll },
  },
  {
    id: "disabled-beats-mock",
    title: "SPONSORKIT_DISABLE wins over mock mode",
    description: "With both mock and SPONSORKIT_DISABLE=1, the result is the disabled shape with mock: false.",
    category: "config",
    specRefs: ["SPEC §7.2", "SPEC §7.4"],
    requires: ["env"],
    steps: [
      configure({ env: { SPONSORKIT_DISABLE: "1" }, mock: "active-monthly" }),
      get({ returns: signedOutResult(DEFAULT_TARGET_STRINGS, { disabled: true }) }),
    ],
    expect: { files: [noStorageDir], requests: noneAtAll },
  },
];

const mockScenario = (preset: MockPresetName, targets: Record<string, string>, suffix = ""): Scenario => {
  const list = Object.entries(targets).map(([p, a]) => parseTargetString(`${p}:${a}`)).sort((a, b) => (`${a.provider}:${a.account}` < `${b.provider}:${b.account}` ? -1 : 1));
  return {
    id: `mock-preset-${preset}${suffix}`,
    title: `Mock preset "${preset}"${suffix ? ` (${suffix.slice(1)} target)` : ""}`,
    description: `mock: "${preset}" returns the expanded preset from fixtures/mock-presets.json without network or disk access.`,
    category: "mock",
    specRefs: ["SPEC §7.4"],
    steps: [
      { action: "configure", args: { ...targets, appName: APP_NAME, mock: preset } },
      get({ returns: { $exact: mockResult(list, preset) }, requests: noneAtAll }),
      { action: "isSignedIn", expect: { returns: preset !== "signed-out" } },
    ],
    expect: { files: [noStorageDir], requests: noneAtAll },
  };
};

const mock: Scenario[] = [
  ...MOCK_PRESET_NAMES.map((p) => mockScenario(p, { ...DEFAULT_TARGETS })),
  mockScenario("active-monthly", { opencollective: DEFAULT_TARGETS.opencollective }, "-opencollective"),
  {
    id: "mock-env-var",
    title: "SPONSORKIT_MOCK selects a preset",
    description: "The SPONSORKIT_MOCK environment variable takes the same preset names as the mock option.",
    category: "mock",
    specRefs: ["SPEC §7.4"],
    requires: ["env"],
    steps: [configure({ env: { SPONSORKIT_MOCK: "one-time" } }), get({ returns: { $exact: mockResult(DEFAULT_TARGET_LIST, "one-time") } })],
    expect: { files: [noStorageDir], requests: noneAtAll },
  },
  {
    id: "mock-option-beats-env",
    title: "The mock option wins over SPONSORKIT_MOCK",
    description: "When both are set the constructor option is used.",
    category: "mock",
    specRefs: ["SPEC §7.4"],
    requires: ["env"],
    steps: [configure({ mock: "org", env: { SPONSORKIT_MOCK: "none" } }), get({ returns: { $exact: mockResult(DEFAULT_TARGET_LIST, "org") } })],
    expect: { files: [noStorageDir], requests: noneAtAll },
  },
  {
    id: "mock-custom-contributions",
    title: "Custom mock contributions",
    description: "mock: { contributions } returns exactly those contributions with signedIn: true and the mock supporter.",
    category: "mock",
    specRefs: ["SPEC §7.4"],
    steps: [
      configure({ mock: { contributions: [contribution("github-checkout-new")] } }),
      get({ returns: { $exact: mockResult(DEFAULT_TARGET_LIST, { contributions: [contribution("github-checkout-new")] }) } }),
    ],
    expect: { files: [noStorageDir], requests: noneAtAll },
  },
  {
    id: "mock-invalid-preset",
    title: "Unknown mock preset is a configuration error",
    description: "An unknown preset name throws invalid_config.",
    category: "mock",
    specRefs: ["SPEC §7.4", "SPEC §7.2"],
    steps: [{ ...configure({ mock: "platinum" }), expect: { throws: "invalid_config" } }],
    expect: { files: [noStorageDir], requests: noneAtAll },
  },
  {
    id: "mock-sign-in-checkout-sign-out",
    title: "Mock sign-in, checkout and sign-out are simulated in memory",
    description:
      "Starting from signed-out: signIn() resolves immediately and yields the empty signed-in shape; openCheckout() resolves immediately with a simulated contribution that later results include; signOut() returns to the signed-out shape. No network, no disk.",
    category: "mock",
    specRefs: ["SPEC §7.4"],
    steps: [
      configure({ mock: "signed-out" }),
      isSignedIn(false),
      { action: "signIn", args: { method: "loopback" }, expect: { maxSeconds: 1 } },
      isSignedIn(true),
      get({ returns: { $exact: mockResult(DEFAULT_TARGET_LIST, "none") } }),
      {
        action: "openCheckout",
        args: { provider: "opencollective", amount: 1000, currency: "EUR", frequency: "one_time", timeout: 30, pollInterval: 1 },
        expect: {
          returns: {
            $exact: {
              status: "contributed",
              contribution: mockCheckoutContribution(DEFAULT_TARGET_LIST, { provider: "opencollective", amount: 1000, currency: "EUR", frequency: "one_time" }),
            },
          },
          maxSeconds: 1,
        },
      },
      get({
        returns: {
          $exact: mockResult(DEFAULT_TARGET_LIST, {
            contributions: [mockCheckoutContribution(DEFAULT_TARGET_LIST, { provider: "opencollective", amount: 1000, currency: "EUR", frequency: "one_time" })],
          }),
        },
      }),
      { action: "signOut" },
      isSignedIn(false),
      get({ returns: { $exact: mockResult(DEFAULT_TARGET_LIST, "signed-out") } }),
    ],
    expect: { files: [noStorageDir], requests: noneAtAll },
  },
];

mock.push({
  id: "mock-nag-in-memory",
  title: "Mock mode keeps nag state in memory",
  description:
    "Mock mode touches neither the network nor the disk (PROTOCOL §7.1 item 14). Nag runs are counted in memory, per SDK instance: due() and shown() work within the instance, no storage file or directory is created, and a restart starts counting from zero (on disk, runs would have reached 2).",
  category: "mock",
  specRefs: ["PROTOCOL §7.1", "SPEC §7.4", "SPEC §7.5"],
  requires: ["restart"],
  steps: [
    configure({ mock: "none" }),
    { action: "nagDue", args: { id: "mock-a", every: 1, predicate: "noActive", force: true }, expect: { returns: true } },
    { action: "nagShown", args: { id: "mock-a" } },
    { action: "nagDue", args: { id: "mock-a", every: 1, predicate: "noActive", force: true }, expect: { returns: false }, note: "shown() reset runs to 0; this run was already counted." },
    { action: "nagDue", args: { id: "mock-b", every: 2, predicate: "noActive", force: true }, expect: { returns: false } },
    restart,
    { action: "nagDue", args: { id: "mock-b", every: 2, predicate: "noActive", force: true }, expect: { returns: false }, note: "A fresh instance starts from runs 0, so runs is 1 here." },
  ],
  expect: { files: [noStorageDir], requests: noneAtAll },
});

const signIn: Scenario[] = [
  {
    id: "signed-out",
    title: "Signed out: no network call",
    description: "A fresh SDK returns the signed-out result without contacting the API and without creating its storage file.",
    category: "sign-in",
    specRefs: ["SPEC §7.2", "SPEC §5.1"],
    steps: [configure(), isSignedIn(false), get({ returns: signedOutResult(), requests: noneAtAll }), { action: "getFinancialContribution", args: { cacheTtl: 0 }, expect: { returns: signedOutResult(), requests: noneAtAll } }],
    expect: { files: [{ path: "$STORAGE_FILE", exists: false }], requests: noneAtAll },
  },
  {
    id: "sign-in-loopback",
    title: "Loopback sign-in",
    description:
      "signIn() binds 127.0.0.1:<random>, opens /connect with delivery=loopback, receives ?code= on /callback, exchanges it with its PKCE verifier, stores the session token and caches the token response's result. The next getFinancialContribution() is served from that cache.",
    category: "sign-in",
    specRefs: ["SPEC §6.2", "PROTOCOL §2", "PROTOCOL §3.2", "PROTOCOL §7", "PROTOCOL §8"],
    requires: ["openBrowser", "signInMethod"],
    steps: [
      configure(),
      signInLoopback({ requests: { exact: true, calls: [connectCall(), tokenCall()] }, maxSeconds: 10 }),
      isSignedIn(true),
      get({
        returns: { signedIn: true, disabled: false, mock: false, targets: DEFAULT_TARGET_STRINGS, supporter: { id: { $regex: "^sup_" }, identities: [GH_IDENTITY] } },
        contributionIds: [GH_DIRECT, GH_ORG],
        requests: none,
      }),
    ],
    expect: {
      files: [
        storageFile({
          v: 1,
          sessionToken: "$LAST_SESSION_TOKEN",
          cache: { result: { signedIn: true, targets: DEFAULT_TARGET_STRINGS }, storedAt: { $type: "datetime" } },
        }),
        noTmpFiles,
      ],
    },
  },
  {
    id: "sign-in-paste",
    title: "Paste-back sign-in",
    description:
      "signIn() with the paste method prints the /connect URL (delivery=paste, no redirect_uri) to stderr and calls promptForCode(). The test harness GETs that URL (the fake answers 200 text/plain whose body is the code) and returns the code. The SDK exchanges it.",
    category: "sign-in",
    specRefs: ["SPEC §6.2", "PROTOCOL §7"],
    requires: ["promptForCode", "signInMethod"],
    steps: [
      configure(),
      {
        action: "signIn",
        args: { method: "paste" },
        expect: { requests: { exact: true, calls: [connectCall({ delivery: "paste", redirect_uri: ABSENT }), tokenCall()] }, maxSeconds: 10 },
      },
      isSignedIn(true),
      get({ returns: { signedIn: true, supporter: { identities: [GH_IDENTITY] } }, contributionIds: [GH_DIRECT, GH_ORG], requests: none }),
    ],
    expect: { files: [storageFile({ v: 1, sessionToken: "$LAST_SESSION_TOKEN" }), noTmpFiles] },
  },
  {
    id: "sign-in-access-denied",
    title: "Provider sign-in denied",
    description:
      "The fake delivers ?error=access_denied to the loopback callback. signIn() rejects with SponsorkitError{code: \"access_denied\"}, does not call /auth/token and stores no token.",
    category: "sign-in",
    specRefs: ["PROTOCOL §4.4", "PROTOCOL §7"],
    requires: ["openBrowser", "signInMethod"],
    server: { connect: { error: "access_denied" } },
    steps: [configure(), signInLoopback({ throws: "access_denied", requests: { exact: true, calls: [connectCall()] }, maxSeconds: 10 }), isSignedIn(false)],
    expect: { files: [{ path: "$STORAGE_FILE", exists: "optional", json: { sessionToken: ABSENT } }] },
  },
  {
    id: "sign-in-cancelled",
    title: "Cancelling sign-in throws cancelled",
    description:
      "The user never finishes sign-in (the fake's /connect delivers nothing). The cancellation signal fires after 1 s; signIn() rejects with cancelled, does not call /auth/token and stores nothing.",
    category: "sign-in",
    specRefs: ["PROTOCOL §7"],
    requires: ["openBrowser", "signInMethod", "cancellation"],
    server: { connect: { abandon: true } },
    steps: [
      configure(),
      { action: "signIn", args: { method: "loopback", cancelAfter: 1 }, expect: { throws: "cancelled", minSeconds: 0.5, maxSeconds: 10, requests: { exact: true, calls: [connectCall()] } } },
      isSignedIn(false),
    ],
    expect: { files: [{ path: "$STORAGE_FILE", exists: "optional", json: { sessionToken: ABSENT } }] },
  },
  {
    id: "sign-in-timeout",
    title: "Sign-in that exceeds signInTimeout throws timeout",
    description: "With signInTimeout: 2 and a sign-in the user never finishes, signIn() rejects with timeout after about 2 s and stores nothing.",
    category: "sign-in",
    specRefs: ["PROTOCOL §7"],
    requires: ["openBrowser", "signInMethod", "signInTimeout"],
    server: { connect: { abandon: true } },
    steps: [
      configure({ signInTimeout: 2 }),
      { action: "signIn", args: { method: "loopback" }, expect: { throws: "timeout", minSeconds: 1.5, maxSeconds: 10, requests: { exact: true, calls: [connectCall()] } } },
      isSignedIn(false),
    ],
    expect: { files: [{ path: "$STORAGE_FILE", exists: "optional", json: { sessionToken: ABSENT } }] },
  },
  {
    id: "sign-in-token-server-error",
    title: "A 5xx from /auth/token throws network_error",
    description: "The code is delivered but POST /api/v1/auth/token answers 503. signIn() rejects with network_error and stores no token.",
    category: "sign-in",
    specRefs: ["PROTOCOL §7", "PROTOCOL §3.2"],
    requires: ["openBrowser", "signInMethod"],
    server: { fail: { status: 503, endpoints: ["token"] } },
    steps: [
      configure(),
      signInLoopback({ throws: "network_error", requests: { exact: true, calls: [connectCall(), tokenCall({}, { min: 1, max: 3 })] }, maxSeconds: 30 }),
      isSignedIn(false),
    ],
    expect: { files: [{ path: "$STORAGE_FILE", exists: "optional", json: { sessionToken: ABSENT } }] },
  },
  {
    id: "sign-in-invalid-code",
    title: "A rejected code exchange throws invalid_code",
    description: "POST /api/v1/auth/token answers 400 invalid_code. signIn() rejects with invalid_code and stores no token.",
    category: "sign-in",
    specRefs: ["PROTOCOL §7", "PROTOCOL §3.2"],
    requires: ["openBrowser", "signInMethod"],
    server: { rejectCodes: true },
    steps: [configure(), signInLoopback({ throws: "invalid_code", requests: { exact: true, calls: [connectCall(), tokenCall()] }, maxSeconds: 10 }), isSignedIn(false)],
    expect: { files: [{ path: "$STORAGE_FILE", exists: "optional", json: { sessionToken: ABSENT } }] },
  },
  {
    id: "sign-in-add-identity",
    title: "Adding a second identity",
    description:
      "While signed in with GitHub, signIn({ provider: \"opencollective\" }) opens /connect with provider=opencollective&add=1 and sends the existing sessionToken to /auth/token. The new token holds both identities, and results include both providers' contributions.",
    category: "sign-in",
    specRefs: ["SPEC §6.2", "PROTOCOL §3.2", "PROTOCOL §4.1"],
    requires: ["openBrowser", "signInMethod"],
    steps: [
      configure(),
      signInLoopback(),
      {
        action: "signIn",
        args: { method: "loopback", provider: "opencollective" },
        expect: {
          requests: { exact: true, calls: [connectCall({ provider: "opencollective", add: "1" }), tokenCall({ sessionToken: "$SESSION_TOKEN_1" })] },
        },
      },
      get({
        returns: { signedIn: true, supporter: { identities: [GH_IDENTITY, OC_IDENTITY] } },
        contributionIds: [GH_DIRECT, GH_ORG, OC_MONTHLY],
        requests: none,
      }),
      refresh({ contributionIds: [GH_DIRECT, GH_ORG, OC_MONTHLY], requests: { calls: [contributionsCall(1, "$SESSION_TOKEN_2")] } }),
    ],
    expect: { files: [storageFile({ v: 1, sessionToken: "$SESSION_TOKEN_2" })] },
  },
  {
    id: "sign-in-add-identity-dead-session",
    title: "Adding an identity to a dead session starts a new session",
    description:
      "The stored session token is no longer valid. signIn({ provider: \"opencollective\" }) opens /connect with add=1 and sends the stored sessionToken; /auth/token answers 401 session_invalid. The SDK clears the stored session and retries the same code once without sessionToken, which succeeds with only the new identity.",
    category: "sign-in",
    specRefs: ["PROTOCOL §7", "PROTOCOL §3.2"],
    requires: ["openBrowser", "signInMethod"],
    steps: [
      { action: "writeStorage", args: { json: { v: 1, sessionToken: DEAD_SESSION_TOKEN } } },
      configure(),
      isSignedIn(true),
      {
        action: "signIn",
        args: { method: "loopback", provider: "opencollective" },
        expect: {
          requests: {
            exact: true,
            calls: [connectCall({ provider: "opencollective", add: "1" }), tokenCall({ sessionToken: DEAD_SESSION_TOKEN }), tokenCall({ sessionToken: ABSENT })],
          },
        },
      },
      isSignedIn(true),
      get({ returns: { signedIn: true, supporter: { identities: [OC_IDENTITY] } }, contributionIds: [OC_MONTHLY], requests: none }),
    ],
    expect: { files: [storageFile({ v: 1, sessionToken: "$SESSION_TOKEN_1", cache: { result: { signedIn: true } } })] },
  },
  {
    id: "sign-out",
    title: "Sign-out deletes the token and cache locally",
    description: "signOut() makes no request (there is no server-side sign-out) and clears the stored token and cache. Afterwards the SDK is signed out and makes no requests.",
    category: "sign-in",
    specRefs: ["SPEC §4", "SPEC §7.6"],
    requires: ["openBrowser", "signInMethod"],
    steps: [configure(), signInLoopback(), { action: "signOut", expect: { requests: none } }, isSignedIn(false), get({ returns: signedOutResult(), requests: none }), restart, isSignedIn(false)],
    expect: { files: [signedOutFile] },
  },
];

const session: Scenario[] = [
  {
    id: "session-invalid",
    title: "session_invalid clears the token and cache",
    description: "When /contributions answers 401 session_invalid, the SDK deletes token and cache and returns the signed-out result. It does not throw.",
    category: "session",
    specRefs: ["SPEC §7.2", "PROTOCOL §3.3"],
    requires: ["openBrowser", "signInMethod"],
    steps: [
      configure(),
      signInLoopback(),
      { action: "control", args: { sessionInvalid: true } },
      refresh({ returns: signedOutResult(), requests: { calls: [contributionsCall(1, "$SESSION_TOKEN_1")] } }),
      isSignedIn(false),
      get({ returns: signedOutResult(), requests: none }),
    ],
    expect: { files: [signedOutFile] },
  },
  {
    id: "session-renewal",
    title: "Sponsorkit-Session renews the stored token",
    description:
      "The first /contributions response carries Sponsorkit-Session with a new token. The SDK replaces its stored token and uses the new one from then on, also after a restart.",
    category: "session",
    specRefs: ["PROTOCOL §3.3", "PROTOCOL §5", "SPEC §7.6"],
    requires: ["openBrowser", "signInMethod", "restart"],
    server: { renewSession: { times: 1 } },
    steps: [
      configure(),
      signInLoopback(),
      refresh({ returns: { signedIn: true }, requests: { calls: [contributionsCall(1, "$SESSION_TOKEN_1")] } }),
      refresh({ returns: { signedIn: true }, requests: { calls: [contributionsCall(1, "$SESSION_TOKEN_2")] } }),
      restart,
      refresh({ returns: { signedIn: true }, requests: { calls: [contributionsCall(1, "$SESSION_TOKEN_2")] } }),
    ],
    expect: { files: [storageFile({ sessionToken: "$SESSION_TOKEN_2" })] },
  },
  {
    id: "session-needs-reconnect",
    title: "needsReconnect is passed through",
    description: "An identity whose provider token expired is returned with needsReconnect: true; the result is otherwise normal.",
    category: "session",
    specRefs: ["SPEC §5.3", "SPEC §6.3"],
    requires: ["openBrowser", "signInMethod"],
    server: { needsReconnect: ["github"] },
    steps: [configure(), signInLoopback(), refresh({ returns: { signedIn: true, stale: false, supporter: { identities: [{ ...GH_IDENTITY, needsReconnect: true }] } } })],
  },
];

const cache: Scenario[] = [
  {
    id: "cache-hit",
    title: "Results are served from the local cache within cacheTtl",
    description:
      "After a refresh, getFinancialContribution() with the default cacheTtl (3600 s) makes no request and returns fromCache: true, stale: false. The cache survives a restart. cacheTtl: 0 always refreshes.",
    category: "cache",
    specRefs: ["SPEC §7.1", "SPEC §7.6", "PROTOCOL §8"],
    requires: ["openBrowser", "signInMethod", "restart"],
    steps: [
      configure(),
      signInLoopback(),
      refresh({ returns: { signedIn: true, fromCache: false, stale: false }, contributionIds: [GH_DIRECT, GH_ORG], requests: { calls: [contributionsCall(1)] } }),
      get({ returns: { signedIn: true, fromCache: true, stale: false }, contributionIds: [GH_DIRECT, GH_ORG], requests: none }),
      restart,
      get({ returns: { signedIn: true, fromCache: true, stale: false }, contributionIds: [GH_DIRECT, GH_ORG], requests: none }),
      refresh({ returns: { fromCache: false }, requests: { calls: [contributionsCall(1)] } }),
    ],
  },
  {
    id: "cache-read-protocol-file",
    title: "A storage file written by another SDK is honoured",
    description:
      "The storage format is shared by all SDKs (PROTOCOL §8). A file with a fresh cache (storedAt = now) is served without a request.",
    category: "cache",
    specRefs: ["PROTOCOL §8"],
    steps: [
      mintGithubSession(),
      {
        action: "writeStorage",
        args: {
          json: {
            v: 1,
            sessionToken: "$MINTED_SESSION_TOKEN",
            cache: {
              result: {
                signedIn: true,
                disabled: false,
                mock: false,
                targets: DEFAULT_TARGET_STRINGS,
                supporter: { id: "sup_fromfile", identities: [GH_IDENTITY] },
                contributions: [contribution("github-checkout-new")],
                fetchedAt: "2026-11-16T18:00:00.000Z",
                stale: false,
                fromCache: false,
              },
              storedAt: "$NOW",
            },
            nags: { conformance: { runs: 2, lastShown: null } },
          },
        },
      },
      configure(),
      isSignedIn(true),
      get({ returns: { signedIn: true, fromCache: true, supporter: { id: "sup_fromfile" } }, contributionIds: [GH_NEW], requests: none }),
    ],
  },
  {
    id: "cache-expired",
    title: "An expired cache is refreshed",
    description: "A cache whose storedAt is older than cacheTtl is not served; the SDK requests /contributions with the stored token.",
    category: "cache",
    specRefs: ["SPEC §7.1", "PROTOCOL §8"],
    steps: [
      mintGithubSession(),
      {
        action: "writeStorage",
        args: {
          json: {
            v: 1,
            sessionToken: "$MINTED_SESSION_TOKEN",
            cache: {
              result: {
                signedIn: true,
                disabled: false,
                mock: false,
                targets: DEFAULT_TARGET_STRINGS,
                supporter: { id: "sup_fromfile", identities: [GH_IDENTITY] },
                contributions: [],
                fetchedAt: "2000-01-01T00:00:00.000Z",
                stale: false,
                fromCache: false,
              },
              storedAt: "2000-01-01T00:00:00.000Z",
            },
          },
        },
      },
      configure(),
      get({ returns: { signedIn: true, fromCache: false, stale: false }, contributionIds: [GH_DIRECT, GH_ORG], requests: { calls: [contributionsCall(1, "$MINTED_SESSION_TOKEN")] } }),
    ],
  },
  {
    id: "offline-with-cache",
    title: "Network error with a cache returns the cache",
    description: "When the API is unreachable the SDK returns its cached result with fromCache: true and stale: true. It never throws and keeps the token.",
    category: "cache",
    specRefs: ["SPEC §7.2"],
    requires: ["openBrowser", "signInMethod"],
    steps: [
      configure(),
      signInLoopback(),
      refresh({ contributionIds: [GH_DIRECT, GH_ORG] }),
      unreachable(),
      refresh({ returns: { signedIn: true, fromCache: true, stale: true }, contributionIds: [GH_DIRECT, GH_ORG], requests: none, maxSeconds: 30 }),
      isSignedIn(true),
    ],
    expect: { files: [storageFile({ sessionToken: "$SESSION_TOKEN_1" })] },
  },
  {
    id: "offline-without-cache",
    title: "Network error without a cache returns an empty, stale, signed-in result",
    description: "Signed in (token on disk) but nothing cached and the API unreachable: the SDK returns the signed-in empty result with stale: true and does not throw.",
    category: "cache",
    specRefs: ["SPEC §7.2"],
    steps: [
      mintGithubSession(),
      { action: "writeStorage", args: { json: { v: 1, sessionToken: "$MINTED_SESSION_TOKEN" } } },
      unreachable(),
      isSignedIn(true),
      get({ returns: signedInEmptyStale, maxSeconds: 30 }),
    ],
    expect: { files: [storageFile({ sessionToken: "$MINTED_SESSION_TOKEN" })], requests: none },
  },
  {
    id: "server-error-with-cache",
    title: "5xx with a cache returns the cache",
    description: "A 503 from /contributions is treated like a network error: cached result, fromCache: true, stale: true, token kept.",
    category: "cache",
    specRefs: ["SPEC §7.2", "PROTOCOL §3"],
    requires: ["openBrowser", "signInMethod"],
    steps: [
      configure(),
      signInLoopback(),
      refresh({ contributionIds: [GH_DIRECT, GH_ORG] }),
      { action: "control", args: { fail: { status: 503, endpoints: ["contributions"] } } },
      refresh({ returns: { signedIn: true, fromCache: true, stale: true }, contributionIds: [GH_DIRECT, GH_ORG], requests: { calls: [contributionsCall({ min: 1, max: 3 })] } }),
    ],
    expect: { files: [storageFile({ sessionToken: "$SESSION_TOKEN_1" })] },
  },
  {
    id: "server-error-without-cache",
    title: "5xx without a cache returns an empty, stale, signed-in result",
    description: "A 500 from /contributions and no cache: signed-in empty result with stale: true; no throw; token kept.",
    category: "cache",
    specRefs: ["SPEC §7.2"],
    server: { fail: { status: 500, endpoints: ["contributions"] } },
    steps: [
      mintGithubSession(),
      { action: "writeStorage", args: { json: { v: 1, sessionToken: "$MINTED_SESSION_TOKEN" } } },
      configure(),
      get({ returns: signedInEmptyStale, requests: { calls: [contributionsCall({ min: 1, max: 3 }, "$MINTED_SESSION_TOKEN")] } }),
    ],
    expect: { files: [storageFile({ sessionToken: "$MINTED_SESSION_TOKEN" })] },
  },
  {
    id: "partial-outage",
    title: "Partial provider outage merges cached contributions",
    description:
      "/contributions reports unavailable: [\"opencollective\"] with stale: true and omits its contributions. The SDK fills in that provider's contributions from its cache and returns stale: true, fromCache: false.",
    category: "cache",
    specRefs: ["SPEC §5.3", "SPEC §7.2", "PROTOCOL §3.3"],
    requires: ["openBrowser", "signInMethod"],
    steps: [
      configure(),
      signInLoopback(),
      { action: "signIn", args: { method: "loopback", provider: "opencollective" } },
      refresh({ contributionIds: [GH_DIRECT, GH_ORG, OC_MONTHLY] }),
      { action: "control", args: { outage: ["opencollective"] } },
      refresh({ returns: { signedIn: true, stale: true, fromCache: false }, contributionIds: [GH_DIRECT, GH_ORG, OC_MONTHLY], requests: { calls: [contributionsCall(1)] } }),
    ],
  },
  {
    id: "partial-outage-without-cache",
    title: "Partial outage without cached data for that provider",
    description: "If nothing is cached for the unavailable provider, only the available provider's contributions are returned, with stale: true.",
    category: "cache",
    specRefs: ["SPEC §5.3", "SPEC §7.2"],
    requires: ["openBrowser", "signInMethod"],
    steps: [
      configure(),
      { action: "control", args: { outage: ["opencollective"] } },
      signInLoopback(),
      { action: "signIn", args: { method: "loopback", provider: "opencollective" } },
      refresh({ returns: { signedIn: true, stale: true, fromCache: false }, contributionIds: [GH_DIRECT, GH_ORG], requests: { calls: [contributionsCall(1)] } }),
    ],
  },
  {
    id: "rate-limited",
    title: "429 rate_limited returns the cache and honours Retry-After",
    description:
      "/contributions answers 429 with Retry-After: 60. The SDK returns the cache (fromCache: true, stale: true), does not throw, and makes no further /contributions request for 60 s even with cacheTtl: 0 and even after the server stops rate limiting.",
    category: "cache",
    specRefs: ["SPEC §5.3", "SPEC §7.2", "PROTOCOL §3"],
    requires: ["openBrowser", "signInMethod"],
    steps: [
      configure(),
      signInLoopback(),
      refresh({ contributionIds: [GH_DIRECT, GH_ORG] }),
      { action: "control", args: { rateLimit: { retryAfter: 60 } } },
      refresh({ returns: { signedIn: true, fromCache: true, stale: true }, contributionIds: [GH_DIRECT, GH_ORG], requests: { calls: [contributionsCall(1)] } }),
      { action: "control", args: { rateLimit: null } },
      refresh({ returns: { signedIn: true, fromCache: true, stale: true }, contributionIds: [GH_DIRECT, GH_ORG], requests: none }),
    ],
    expect: { files: [storageFile({ sessionToken: "$SESSION_TOKEN_1" })] },
  },
  {
    id: "rate-limited-without-cache",
    title: "429 without a cache returns an empty, stale, signed-in result",
    description: "Rate limited and nothing cached: signed-in empty result with stale: true; no throw.",
    category: "cache",
    specRefs: ["SPEC §7.2"],
    server: { rateLimit: { retryAfter: 30 } },
    steps: [
      mintGithubSession(),
      { action: "writeStorage", args: { json: { v: 1, sessionToken: "$MINTED_SESSION_TOKEN" } } },
      configure(),
      get({ returns: signedInEmptyStale, requests: { calls: [contributionsCall(1, "$MINTED_SESSION_TOKEN")] } }),
      get({ returns: signedInEmptyStale, requests: none }),
    ],
  },
];

const checkoutQuery = (q: Record<string, unknown>) => ({ targets: DEFAULT_TARGETS_PARAM, challenge: ABSENT, delivery: ABSENT, redirect_uri: ABSENT, ...q });
const providerPageCall = (to: string): Call => ({ method: "GET", path: "/__fake/provider/github", count: 1, query: { to } });

const checkout: Scenario[] = [
  {
    id: "checkout-detects-new-contribution",
    title: "Checkout detects a new contribution",
    description:
      "Signed in, openCheckout() opens /checkout (no challenge) which redirects to the provider. The SDK polls /contributions with cacheTtl 0; the second poll after the provider page was loaded contains a new contribution, and openCheckout resolves { status: \"contributed\", contribution }.",
    category: "checkout",
    specRefs: ["SPEC §7.3", "PROTOCOL §4.6", "PROTOCOL §6"],
    requires: ["openBrowser", "signInMethod", "checkoutPollInterval"],
    server: { newContribution: { contribution: "github-checkout-new", trigger: "checkout", afterCalls: 1 } },
    steps: [
      configure(),
      signInLoopback(),
      {
        action: "openCheckout",
        args: { provider: "github", amount: 1000, frequency: "monthly", timeout: 30, pollInterval: 1 },
        expect: {
          returns: { $exact: { status: "contributed", contribution: contribution("github-checkout-new") } },
          maxSeconds: 15,
          requests: {
            exact: true,
            calls: [
              { method: "GET", path: "/checkout", count: 1, query: checkoutQuery({ provider: "github", amount: "1000", frequency: "monthly" }) },
              providerPageCall("https://github.com/sponsors/sponsorkit-conformance/sponsorships?tier_id=102"),
              contributionsCall({ min: 2 }),
            ],
          },
        },
      },
      get({ contributionIds: [GH_DIRECT, GH_ORG, GH_NEW], requests: none }),
    ],
  },
  {
    id: "checkout-detects-changed-contribution",
    title: "Checkout detects a changed contribution",
    description: "A cancelled sponsorship that becomes active again (same id, changed status) counts as a result of the checkout.",
    category: "checkout",
    specRefs: ["SPEC §7.3"],
    requires: ["openBrowser", "signInMethod", "checkoutPollInterval"],
    server: { contributions: ["github-cancelled"], newContribution: { contribution: "github-cancelled-reactivated", trigger: "checkout", afterCalls: 0 } },
    steps: [
      configure(),
      signInLoopback(),
      refresh({ returns: { contributions: [{ status: "cancelled" }] } }),
      {
        action: "openCheckout",
        args: { provider: "github", amount: 500, frequency: "monthly", timeout: 30, pollInterval: 1 },
        expect: {
          returns: { $exact: { status: "contributed", contribution: contribution("github-cancelled-reactivated") } },
          maxSeconds: 15,
          requests: {
            exact: true,
            calls: [
              { method: "GET", path: "/checkout", count: 1, query: checkoutQuery({ provider: "github", amount: "500", frequency: "monthly" }) },
              providerPageCall("https://github.com/sponsors/sponsorkit-conformance/sponsorships?tier_id=101"),
              contributionsCall({ min: 1 }),
            ],
          },
        },
      },
    ],
  },
  {
    id: "checkout-timeout",
    title: "Checkout times out with status unknown",
    description: "Nothing changes; after `timeout` seconds openCheckout resolves { status: \"unknown\" } (no contribution). It never throws.",
    category: "checkout",
    specRefs: ["SPEC §7.3"],
    requires: ["openBrowser", "signInMethod", "checkoutPollInterval"],
    steps: [
      configure(),
      signInLoopback(),
      {
        action: "openCheckout",
        args: { provider: "github", frequency: "one_time", timeout: 3, pollInterval: 1 },
        expect: {
          returns: { $exact: { status: "unknown" } },
          minSeconds: 2.5,
          maxSeconds: 10,
          requests: {
            exact: true,
            calls: [
              { method: "GET", path: "/checkout", count: 1, query: checkoutQuery({ provider: "github", frequency: "one_time", amount: ABSENT }) },
              providerPageCall("https://github.com/sponsors/sponsorkit-conformance/sponsorships?tier_id=201"),
              contributionsCall({ min: 2 }),
            ],
          },
        },
      },
    ],
  },
  {
    id: "checkout-cancelled",
    title: "Cancelling a checkout resolves status unknown",
    description: "The cancellation signal (AbortSignal / CancellationToken / context / ...) fires after 1.5 s; openCheckout stops polling and resolves { status: \"unknown\" } without throwing.",
    category: "checkout",
    specRefs: ["SPEC §7.3"],
    requires: ["openBrowser", "signInMethod", "checkoutPollInterval", "cancellation"],
    steps: [
      configure(),
      signInLoopback(),
      {
        action: "openCheckout",
        args: { provider: "github", timeout: 60, pollInterval: 1, cancelAfter: 1.5 },
        expect: { returns: { $exact: { status: "unknown" } }, maxSeconds: 10 },
      },
      { action: "wait", args: { seconds: 2 }, expect: { requests: none }, note: "No polling continues after cancellation." },
    ],
  },
  {
    id: "checkout-signs-in-first",
    title: "Checkout while signed out signs in first (loopback)",
    description:
      "openCheckout() while signed out opens /checkout with challenge, delivery=loopback and redirect_uri. The fake delivers ?code= to the loopback callback, which redirects the browser to <apiBaseUrl>/checkout carrying exactly targets, the checkout options that were set (provider, amount, currency, frequency) and step=choose (PROTOCOL §7.1 item 17); the SDK exchanges the code, then polls until the new contribution appears.",
    category: "checkout",
    specRefs: ["SPEC §7.3", "PROTOCOL §4.6", "PROTOCOL §7", "PROTOCOL §7.1"],
    requires: ["openBrowser", "signInMethod", "checkoutPollInterval"],
    server: { newContribution: { contribution: "github-checkout-new", trigger: "checkout", afterCalls: 0 } },
    steps: [
      configure(),
      {
        action: "openCheckout",
        args: { method: "loopback", provider: "github", amount: 1000, frequency: "monthly", timeout: 30, pollInterval: 1 },
        expect: {
          returns: { $exact: { status: "contributed", contribution: contribution("github-checkout-new") } },
          maxSeconds: 15,
          requests: {
            exact: true,
            calls: [
              {
                method: "GET",
                path: "/checkout",
                count: 1,
                query: { targets: DEFAULT_TARGETS_PARAM, challenge: CHALLENGE, delivery: "loopback", redirect_uri: LOOPBACK_URI, provider: "github", amount: "1000", frequency: "monthly", step: ABSENT },
              },
              {
                method: "GET",
                path: "/checkout",
                count: 1,
                query: { $exact: { targets: DEFAULT_TARGETS_PARAM, provider: "github", amount: "1000", frequency: "monthly", step: "choose" } },
              },
              tokenCall(),
              providerPageCall("https://github.com/sponsors/sponsorkit-conformance/sponsorships?tier_id=102"),
              contributionsCall({ min: 1 }),
            ],
          },
        },
      },
      isSignedIn(true),
    ],
    expect: { files: [storageFile({ sessionToken: "$SESSION_TOKEN_1" })] },
  },
  {
    id: "checkout-url",
    title: "checkoutUrl() is synchronous and offline",
    description: "checkoutUrl() returns <apiBaseUrl>/checkout with the canonical targets and the given options, never a PKCE challenge, and makes no request.",
    category: "checkout",
    specRefs: ["SPEC §7.3", "PROTOCOL §4.6"],
    steps: [
      configure(),
      {
        action: "checkoutUrl",
        args: { amount: 500, frequency: "monthly" },
        expect: { returns: { $url: { base: "$BASE_URL/checkout", query: { $exact: { targets: DEFAULT_TARGETS_PARAM, amount: "500", frequency: "monthly" } } } } },
      },
      {
        action: "checkoutUrl",
        args: { provider: "opencollective", amount: 1500, currency: "EUR", frequency: "yearly" },
        expect: {
          returns: {
            $url: {
              base: "$BASE_URL/checkout",
              query: { $exact: { targets: DEFAULT_TARGETS_PARAM, provider: "opencollective", amount: "1500", currency: "EUR", frequency: "yearly" } },
            },
          },
        },
      },
    ],
    expect: { requests: noneAtAll, files: [{ path: "$STORAGE_FILE", exists: false }] },
  },
  {
    id: "checkout-url-invalid",
    title: "checkoutUrl() rejects invalid options with invalid_config",
    description:
      "An unconfigured provider, an invalid frequency, a non-positive amount or a malformed currency throws invalid_config (PROTOCOL §7.1 item 16; Go returns the error). No network, no disk. A harness whose SDK types cannot express a value (e.g. a frequency enum) treats that step as passed.",
    category: "checkout",
    specRefs: ["PROTOCOL §7.1", "SPEC §7.3"],
    steps: [
      { action: "configure", args: { github: DEFAULT_TARGETS.github, appName: APP_NAME } },
      { action: "checkoutUrl", args: { provider: "opencollective" }, expect: { throws: "invalid_config" }, note: "opencollective is not configured." },
      configure(),
      { action: "checkoutUrl", args: { frequency: "weekly" }, expect: { throws: "invalid_config" } },
      { action: "checkoutUrl", args: { amount: 0 }, expect: { throws: "invalid_config" } },
      { action: "checkoutUrl", args: { amount: -500 }, expect: { throws: "invalid_config" } },
      { action: "checkoutUrl", args: { currency: "EURO" }, expect: { throws: "invalid_config" } },
      { action: "checkoutUrl", args: { provider: "patreon" }, expect: { throws: "invalid_config" } },
    ],
    expect: { requests: noneAtAll, files: [noStorageDir] },
  },
];

const nagDue = (expectValue: boolean, args: Record<string, unknown> = {}): Step => ({
  action: "nagDue",
  args: { id: "conformance", every: 3, predicate: "always", force: true, ...args },
  expect: { returns: expectValue, requests: none },
});

const nag: Scenario[] = [
  {
    id: "nag-run-counting",
    title: "Nag run counting",
    description:
      "runs goes up by one per process per id on the first due() call. due() is true once runs >= every; shown() resets runs to 0 and sets lastShown. force: true bypasses the TTY/CI checks.",
    category: "nag",
    specRefs: ["SPEC §7.5", "PROTOCOL §8"],
    requires: ["restart"],
    steps: [
      configure(),
      nagDue(false),
      { ...nagDue(false), note: "Second call in the same process does not count another run." },
      restart,
      nagDue(false),
      restart,
      nagDue(true),
      { action: "nagShown", args: { id: "conformance" }, expect: { requests: none } },
      restart,
      nagDue(false),
    ],
    expect: { files: [storageFile({ v: 1, nags: { conformance: { runs: 1, lastShown: { $type: "datetime" } } } })], requests: none },
  },
  {
    id: "nag-predicate",
    title: "The nag predicate gates due() but runs still count",
    description: "With a false predicate due() is false even when runs >= every; runs are still counted. The predicate receives the current result.",
    category: "nag",
    specRefs: ["SPEC §7.5"],
    requires: ["restart", "openBrowser", "signInMethod"],
    steps: [
      configure(),
      nagDue(false, { every: 1, predicate: "never" }),
      restart,
      nagDue(false, { every: 1, predicate: "never" }),
      { ...nagDue(true, { every: 1, predicate: "noActive" }), note: "Signed out: no active contributions." },
      signInLoopback(),
      restart,
      { ...nagDue(false, { every: 1, predicate: "noActive" }), note: "Signed in with an active contribution (served from the sign-in cache)." },
    ],
    expect: { files: [storageFile({ nags: { conformance: { runs: 3, lastShown: null } } })] },
  },
  {
    id: "nag-suppressed",
    title: "CI and SPONSORKIT_NO_NAG suppress nags unless forced",
    description:
      "Without force, due() is false when CI or SPONSORKIT_NO_NAG is set, and when the terminal is not interactive (interactive: false, set explicitly so the scenario is deterministic in a TTY). force: true overrides these checks.",
    category: "nag",
    specRefs: ["SPEC §7.5", "PROTOCOL §7"],
    requires: ["env", "interactive"],
    steps: [
      configure({ env: { CI: "true" }, interactive: false }),
      nagDue(false, { every: 1, force: false }),
      configure({ env: { SPONSORKIT_NO_NAG: "1" }, interactive: false }),
      nagDue(false, { every: 1, force: false }),
      configure({ env: {}, interactive: false }),
      { ...nagDue(false, { every: 1, force: false }), note: "Not interactive." },
      configure({ env: { CI: "true" }, interactive: false }),
      nagDue(true, { every: 1, force: true }),
    ],
    expect: { requests: none },
  },
  {
    id: "nag-interactive",
    title: "The interactive option overrides TTY detection",
    description:
      "With interactive: true and an empty env, a non-forced nag is due even though the test process has no TTY. CI and SPONSORKIT_NO_NAG still suppress it.",
    category: "nag",
    specRefs: ["SPEC §7.5", "PROTOCOL §7"],
    requires: ["env", "interactive"],
    steps: [
      configure({ env: {}, interactive: true }),
      nagDue(true, { every: 1, force: false }),
      configure({ env: { CI: "true" }, interactive: true }),
      nagDue(false, { every: 1, force: false }),
      configure({ env: { SPONSORKIT_NO_NAG: "1" }, interactive: true }),
      nagDue(false, { every: 1, force: false }),
    ],
    expect: { requests: none },
  },
  {
    id: "nag-or-every",
    title: "orEvery makes a nag due after a duration since lastShown",
    description:
      "orEvery is an ISO-8601 duration. With lastShown null the duration clause is false. After shown(), due() becomes true once the duration has elapsed, regardless of runs.",
    category: "nag",
    specRefs: ["SPEC §7.5"],
    requires: ["restart"],
    steps: [
      configure(),
      nagDue(false, { every: 100, orEvery: "PT2S" }),
      { action: "nagShown", args: { id: "conformance" } },
      restart,
      nagDue(false, { every: 100, orEvery: "PT2S" }),
      { action: "wait", args: { seconds: 2.2 } },
      restart,
      nagDue(true, { every: 100, orEvery: "PT2S" }),
    ],
    expect: { files: [storageFile({ nags: { conformance: { runs: 2, lastShown: { $type: "datetime" } } } })] },
  },
];

const storage: Scenario[] = [
  {
    id: "storage-permissions",
    title: "Storage directory 0700, files 0600",
    description: "The storage directory is created with mode 0700 and the storage file with 0600 (POSIX). Writes are atomic (temp file + rename), so no *.tmp files remain.",
    category: "storage",
    specRefs: ["PROTOCOL §8", "SPEC §7.6"],
    requires: ["openBrowser", "signInMethod", "posixPermissions"],
    steps: [configure(), signInLoopback(), refresh()],
    expect: {
      files: [{ path: "$STORAGE_DIR", exists: true, kind: "directory", mode: "0700" }, storageFile({ v: 1 }, { mode: "0600" }), noTmpFiles],
    },
  },
  {
    id: "storage-concurrent-writes",
    title: "Concurrent writers never corrupt the storage file",
    description:
      "Eight SDK instances (same storageDir) refresh concurrently, then eight record nag runs concurrently. The file is always valid JSON matching the storage schema, keeps the session token, and no *.tmp files remain. Lost nag increments are acceptable.",
    category: "storage",
    specRefs: ["PROTOCOL §8", "SPEC §7.6"],
    requires: ["openBrowser", "signInMethod"],
    steps: [
      configure(),
      signInLoopback(),
      { action: "parallel", args: { instances: 8, step: { action: "getFinancialContribution", args: { cacheTtl: 0 } } }, expect: { requests: { calls: [contributionsCall(8)] } } },
      { action: "parallel", args: { instances: 8, step: { action: "nagDue", args: { id: "conformance", every: 1, predicate: "never", force: true } } } },
    ],
    expect: {
      files: [storageFile({ v: 1, sessionToken: "$SESSION_TOKEN_1", cache: { result: { signedIn: true } }, nags: { conformance: { runs: { $type: "integer" } } } }), noTmpFiles],
    },
  },
  {
    id: "storage-per-target-set",
    title: "Storage is keyed by targets_hash",
    description: "Instances with different target sets use different files (<targets_hash>.json) and do not share sessions.",
    category: "storage",
    specRefs: ["PROTOCOL §1", "PROTOCOL §8"],
    requires: ["openBrowser", "signInMethod"],
    steps: [configure(), signInLoopback(), { action: "configure", args: { github: DEFAULT_TARGETS.github, appName: APP_NAME } }, isSignedIn(false)],
    expect: {
      files: [storageFile({ sessionToken: "$SESSION_TOKEN_1" }), { path: `$STORAGE_DIR/${GITHUB_ONLY_HASH}.json`, exists: false }],
    },
  },
];

const serverHelper: Scenario[] = [
  {
    id: "verify-session-match",
    title: "verifySession with matching targets",
    description:
      "verifySession(token, targets) calls /contributions with the token and returns the result when its targets equal the given set (after normalization and canonical ordering). It touches no storage.",
    category: "server-helper",
    specRefs: ["SPEC §6.4", "SPEC §7.7"],
    steps: [
      mintGithubSession(),
      {
        action: "verifySession",
        args: { token: "$MINTED_SESSION_TOKEN", targets: { opencollective: "sponsorkit-conformance", github: "SponsorKit-Conformance" } },
        expect: {
          returns: { signedIn: true, targets: DEFAULT_TARGET_STRINGS, supporter: { identities: [GH_IDENTITY] } },
          contributionIds: [GH_DIRECT, GH_ORG],
          requests: { calls: [contributionsCall(1, "$MINTED_SESSION_TOKEN")] },
        },
      },
    ],
    expect: { files: [noStorageDir] },
  },
  {
    id: "verify-session-mismatch",
    title: "verifySession with mismatched targets throws",
    description: "The session is bound to github:sponsorkit-conformance only; verifying against both targets throws targets_mismatch.",
    category: "server-helper",
    specRefs: ["SPEC §6.4"],
    steps: [
      mintGithubSession(GITHUB_ONLY_PARAM),
      {
        action: "verifySession",
        args: { token: "$MINTED_SESSION_TOKEN", targets: { ...DEFAULT_TARGETS } },
        expect: { throws: "targets_mismatch", requests: { calls: [contributionsCall(1, "$MINTED_SESSION_TOKEN")] } },
      },
      {
        action: "verifySession",
        args: { token: "$MINTED_SESSION_TOKEN", targets: { github: DEFAULT_TARGETS.github } },
        expect: { returns: { signedIn: true, targets: [GITHUB_ONLY_PARAM] } },
      },
    ],
    expect: { files: [noStorageDir] },
  },
  {
    id: "verify-session-invalid",
    title: "verifySession with an invalid session throws",
    description: "Unlike the client, the server helper throws session_invalid for a rejected token (and for a malformed one).",
    category: "server-helper",
    specRefs: ["SPEC §6.4"],
    server: { sessionInvalid: true },
    steps: [
      mintGithubSession(),
      { action: "verifySession", args: { token: "$MINTED_SESSION_TOKEN", targets: { ...DEFAULT_TARGETS } }, expect: { throws: "session_invalid" } },
      { action: "verifySession", args: { token: "sks_not-a-real-token", targets: { ...DEFAULT_TARGETS } }, expect: { throws: "session_invalid" } },
    ],
    expect: { files: [noStorageDir] },
  },
  {
    id: "verify-session-unreachable",
    title: "verifySession throws network_error when the API is unreachable",
    description: "Connection refused: verifySession throws network_error without retryAfter. It touches no storage.",
    category: "server-helper",
    specRefs: ["PROTOCOL §7", "SPEC §6.4"],
    steps: [
      {
        action: "verifySession",
        args: { token: DEAD_SESSION_TOKEN, targets: { ...DEFAULT_TARGETS }, apiBaseUrl: "$UNREACHABLE_BASE_URL" },
        expect: { throws: "network_error", error: { code: "network_error", retryAfter: { $absent: true } }, maxSeconds: 30, requests: noneAtAll },
      },
    ],
    expect: { files: [noStorageDir] },
  },
  {
    id: "verify-session-rate-limited",
    title: "verifySession throws network_error with retryAfter on 429",
    description: "/contributions answers 429 rate_limited with Retry-After: 30. verifySession throws network_error carrying retryAfter: 30.",
    category: "server-helper",
    specRefs: ["PROTOCOL §7", "PROTOCOL §3.3"],
    server: { rateLimit: { retryAfter: 30 } },
    steps: [
      mintGithubSession(),
      {
        action: "verifySession",
        args: { token: "$MINTED_SESSION_TOKEN", targets: { ...DEFAULT_TARGETS } },
        expect: { throws: "network_error", error: { code: "network_error", retryAfter: 30 }, requests: { calls: [contributionsCall(1, "$MINTED_SESSION_TOKEN")] } },
      },
    ],
    expect: { files: [noStorageDir] },
  },
  {
    id: "verify-session-server-error",
    title: "verifySession throws network_error on 5xx",
    description: "/contributions answers 503. verifySession throws network_error (no retryAfter); it does not throw session_invalid.",
    category: "server-helper",
    specRefs: ["PROTOCOL §7"],
    server: { fail: { status: 503, endpoints: ["contributions"] } },
    steps: [
      mintGithubSession(),
      {
        action: "verifySession",
        args: { token: "$MINTED_SESSION_TOKEN", targets: { ...DEFAULT_TARGETS } },
        expect: { throws: "network_error", error: { code: "network_error", retryAfter: { $absent: true } }, requests: { calls: [contributionsCall({ min: 1, max: 3 }, "$MINTED_SESSION_TOKEN")] } },
      },
    ],
    expect: { files: [noStorageDir] },
  },
];

export const VARIABLES: Record<string, string> = {
  $BASE_URL: "runtime: http://127.0.0.1:<port> of the fake server (from the LISTENING line)",
  $STORAGE_DIR: "runtime: a fresh absolute path per scenario whose parent exists and which does not exist yet",
  $STORAGE_FILE: "$STORAGE_DIR/$TARGETS_HASH.json",
  $TARGETS_PARAM: DEFAULT_TARGETS_PARAM,
  $TARGETS_HASH: DEFAULT_TARGETS_HASH,
  $LAST_SESSION_TOKEN: "runtime: GET /__control -> lastSessionToken",
  $SESSION_TOKEN_1: "runtime: GET /__control -> issuedSessionTokens[0] (1-based: $SESSION_TOKEN_<n> is issuedSessionTokens[n-1])",
  $SESSION_TOKEN_2: "runtime: GET /__control -> issuedSessionTokens[1]",
  $MINTED_SESSION_TOKEN: "runtime: sessionToken returned by the most recent mintSession step",
  $UNREACHABLE_BASE_URL: "runtime: GET /__control/unreachable -> baseUrl (fetch once per scenario, before the first step)",
  $NOW: "runtime: current UTC time, ISO-8601, evaluated when the step starts",
};

export function buildScenariosFile(): ScenariosFile {
  return {
    $schema: "./schemas/scenarios.schema.json",
    version: 1,
    variables: VARIABLES,
    defaults: { targets: { ...DEFAULT_TARGETS }, appName: APP_NAME },
    scenarios: [...config, ...mock, ...signIn, ...session, ...cache, ...checkout, ...nag, ...storage, ...serverHelper],
  };
}
