/** Maps the conformance runner's step vocabulary onto `@sponsorkit/sdk/node`. */
import type { SdkAdapter, SdkInstance } from "@sponsorkit/conformance";
import type { Frequency, MockOption, Provider } from "../../src/node/index";

// SPONSORKIT_TEST_DIST=1 runs the suite against the built package (dist/) instead of the sources.
const useDist = !!process.env.SPONSORKIT_TEST_DIST;
const nodeEntry: typeof import("../../src/node/index") = useDist ? await import("../../dist/node.js" as string) : await import("../../src/node/index");
const serverEntry: typeof import("../../src/server") = useDist ? await import("../../dist/server.js" as string) : await import("../../src/server");
const { Sponsorkit, SponsorkitError, resetProcessState } = nodeEntry;
const { verifySession } = serverEntry;

const predicates = {
  always: () => true,
  never: () => false,
  noActive: (fc: { active(): unknown[] }) => fc.active().length === 0,
};

/** Text the SDK printed for the user (paste URLs etc.), per instance. */
export const printed: string[] = [];

export const nodeAdapter: SdkAdapter = {
  create(config, hooks): SdkInstance {
    const sk = new Sponsorkit({
      github: config.github,
      opencollective: config.opencollective,
      appName: config.appName,
      cacheTtl: config.cacheTtl,
      mock: config.mock as MockOption | undefined,
      apiBaseUrl: config.apiBaseUrl,
      // Passed only when the scenario sets it; an empty string is passed as-is (the SDK treats it as unset).
      ...(config.siteBaseUrl !== undefined ? { siteBaseUrl: config.siteBaseUrl } : {}),
      storageDir: config.storageDir,
      signInMethod: config.signInMethod,
      // Always passed: it replaces the process environment for the SPONSORKIT_* variables and CI.
      env: config.env,
      // Optional settings are passed only when the scenario sets them, so the SDK defaults are exercised otherwise.
      ...(config.devChecks !== undefined ? { devChecks: config.devChecks } : {}),
      ...(config.signInTimeout !== undefined ? { signInTimeout: config.signInTimeout } : {}),
      ...(config.interactive !== undefined ? { interactive: config.interactive } : {}),
      openBrowser: hooks.openBrowser,
      promptForCode: hooks.promptForCode,
      output: { write: (text: string) => printed.push(text) },
    });
    return {
      signIn: ({ method, provider, signal }) => sk.signIn({ method, provider: provider as Provider | undefined, signal }),
      isSignedIn: () => sk.isSignedIn(),
      getFinancialContribution: ({ cacheTtl }) => sk.getFinancialContribution({ cacheTtl }),
      openCheckout: ({ method, provider, amount, currency, frequency, timeout, pollInterval, signal }) =>
        sk.openCheckout({ method, provider: provider as Provider | undefined, amount, currency, frequency, timeout, pollInterval, signal }),
      // The kit passes deliberately invalid values (e.g. frequency "weekly"); the SDK validates at runtime.
      checkoutUrl: ({ provider, amount, currency, frequency }) =>
        sk.checkoutUrl({ provider: provider as Provider | undefined, amount, currency, frequency: frequency as Frequency | undefined }),
      signOut: () => sk.signOut(),
      nagDue: ({ id, every, orEvery, predicate, force }) => sk.nag({ id, every, orEvery }).due(predicates[predicate], { force }),
      nagShown: ({ id }) => sk.nag({ id, every: 1 }).shown(),
    };
  },
  resetProcessState() {
    resetProcessState();
  },
  verifySession(token, targets, { apiBaseUrl }) {
    return verifySession(token, targets, { apiBaseUrl });
  },
  errorCode(error) {
    return error instanceof SponsorkitError ? error.code : undefined;
  },
  errorRetryAfter(error) {
    return error instanceof SponsorkitError ? error.retryAfter : undefined;
  },
};
