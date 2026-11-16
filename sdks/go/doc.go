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
//		fmt.Fprintln(os.Stderr, "Support my-cli:", sk.CheckoutURL(sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly}))
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
// Every error is an *Error with a Code (see ErrorCode). The client never
// returns errors for network or server problems: GetFinancialContribution
// serves the cache (FromCache and Stale set) or a signed-in empty result with
// Stale set, honours Retry-After, and treats session_invalid as a sign-out.
// With SPONSORKIT_DISABLE set there is no network or disk access at all.
//
// # Testing
//
// Options.Mock (MockPreset, MockContributions) or the SPONSORKIT_MOCK
// environment variable switch to mock mode: no network, no disk, results carry
// Mock: true. Options also exposes test hooks: APIBaseURL, StorageDir,
// OpenBrowser, PromptForCode, SignInMethod, Env, DevChecks,
// CheckoutPollInterval and Clock. ResetProcessState simulates a new process.
//
// The wire protocol is specified in docs/PROTOCOL.md of
// https://github.com/sponsorkit/sponsorkit.io; this package passes the
// language-neutral conformance suite in sdks/conformance.
package sponsorkit
