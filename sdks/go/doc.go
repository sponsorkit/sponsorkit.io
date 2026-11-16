// Package sponsorkit builds financial contributions (GitHub Sponsors and Open
// Collective) directly into Go programs. It needs no account, API key or
// setup: name the account(s) you receive sponsorships on and write your own
// rule.
//
//	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", AppName: "my-cli"})
//	if err != nil {
//		log.Fatal(err) // invalid_config: malformed targets or options
//	}
//	fc, _ := sk.GetFinancialContribution(ctx)
//	if fc.SignedIn && len(fc.Active()) == 0 {
//		link, _ := sk.CheckoutURL(sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly})
//		fmt.Fprintln(os.Stderr, "Support my-cli:", link)
//	}
//
// # What the client does
//
//   - GetFinancialContribution reports what the signed-in user contributed to
//     your targets. Results are cached locally (CacheTTL, default one hour).
//   - SignIn signs the user in with the loopback flow (a local server on
//     127.0.0.1 plus the system browser) or the paste-back flow for headless
//     machines. Calling it again with another provider adds a second identity.
//   - OpenCheckout sends the user to contribute and polls until the new
//     contribution shows up; CheckoutURL is an offline link to the same page.
//   - Nag decides when to show a "please support" message.
//   - VerifySession lets a backend check a session token forwarded by a client.
//
// # Error contract
//
// Every error is an *Error with a Code (see ErrorCode; the codes are those of
// PROTOCOL §7). GetFinancialContribution never returns errors for network or
// server problems: it
// serves the cache (FromCache and Stale set) or a signed-in empty result with
// Stale set, honours Retry-After, and treats session_invalid as a sign-out.
// SignIn reports them as network_error (with Error.RetryAfter when the API sent
// Retry-After), and reports cancellation of its context.Context as cancelled
// and Options.SignInTimeout as timeout. With SPONSORKIT_DISABLE set there is
// no network or disk access at all.
//
// # Testing
//
// Options.Mock (MockPreset, MockContributions) or the SPONSORKIT_MOCK
// environment variable switch to mock mode: no network, no disk, results carry
// Mock: true. Options also exposes test hooks: APIBaseURL, StorageDir,
// OpenBrowser, PromptForCode, SignInMethod, SignInTimeout, RequestTimeout, Env, DevChecks,
// Interactive, CheckoutPollInterval and Clock. Env replaces the process
// environment for the SPONSORKIT_* variables and CI; the dev-time target check
// is off unless DevChecks or SPONSORKIT_DEV_CHECKS turns it on. ResetProcessState simulates a new process.
//
// The wire protocol is specified in docs/PROTOCOL.md of
// https://github.com/sponsorkit/sponsorkit.io; this package passes the
// language-neutral conformance suite in sdks/conformance.
package sponsorkit
