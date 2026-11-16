/** Maps the conformance runner's step vocabulary onto `@sponsorkit/sdk/node`. */
import type { SdkAdapter, SdkInstance } from "@sponsorkit/conformance";
import type { MockOption, Provider } from "../../src/node/index";

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
      storageDir: config.storageDir,
      signInMethod: config.signInMethod,
      env: config.env,
      devChecks: config.devChecks,
      openBrowser: hooks.openBrowser,
      promptForCode: hooks.promptForCode,
      output: { write: (text: string) => printed.push(text) },
      // The kit assumes a non-TTY test process (nag-suppressed). When the suite runs in a terminal,
      // simulate that; otherwise the SDK's real TTY detection is exercised.
      ...(process.stdout.isTTY && process.stderr.isTTY ? { interactive: false } : {}),
    });
    return {
      signIn: ({ method, provider }) => sk.signIn({ method, provider: provider as Provider | undefined }),
      isSignedIn: () => sk.isSignedIn(),
      getFinancialContribution: ({ cacheTtl }) => sk.getFinancialContribution({ cacheTtl }),
      openCheckout: ({ method, provider, amount, currency, frequency, timeout, pollInterval, signal }) =>
        sk.openCheckout({ method, provider: provider as Provider | undefined, amount, currency, frequency, timeout, pollInterval, signal }),
      checkoutUrl: ({ provider, amount, currency, frequency }) =>
        sk.checkoutUrl({ provider: provider as Provider | undefined, amount, currency, frequency: frequency as never }),
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
};
