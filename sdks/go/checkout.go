package sponsorkit

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// CheckoutOptions describes the contribution to suggest. All fields are optional.
type CheckoutOptions struct {
	// Provider preselects "github" or "opencollective"; the page never
	// silently switches to another provider.
	Provider Provider
	// Amount in minor units (cents). Zero means unset.
	Amount int64
	// Currency is an ISO 4217 code. GitHub is always USD.
	Currency string
	// Frequency is OneTime, Monthly or Yearly.
	Frequency Frequency

	// Timeout bounds how long OpenCheckout waits for a new contribution.
	// Defaults to 10 minutes. Ignored by CheckoutURL.
	Timeout time.Duration
	// PollInterval overrides Options.CheckoutPollInterval for this call.
	PollInterval time.Duration
	// SignInMethod overrides Options.SignInMethod when OpenCheckout has to
	// sign the user in first.
	SignInMethod SignInMethod
}

var currencyCode = regexp.MustCompile(`^[A-Za-z]{3}$`)

// checkoutQuery returns the validated /checkout query without sign-in params.
// Invalid fields are left out and reported in the error.
func (c *Client) checkoutQuery(o CheckoutOptions) (url.Values, error) {
	q := url.Values{}
	q.Set("targets", c.param)
	var problems []string
	if o.Provider != "" {
		if c.hasProvider(o.Provider) {
			q.Set("provider", string(o.Provider))
		} else {
			problems = append(problems, fmt.Sprintf("no %s target is configured", o.Provider))
		}
	}
	if o.Amount != 0 {
		if o.Amount > 0 {
			q.Set("amount", strconv.FormatInt(o.Amount, 10))
		} else {
			problems = append(problems, "Amount must be a positive number of minor units")
		}
	}
	if o.Currency != "" {
		if currencyCode.MatchString(o.Currency) {
			q.Set("currency", strings.ToUpper(o.Currency))
		} else {
			problems = append(problems, fmt.Sprintf("invalid currency %q", o.Currency))
		}
	}
	if o.Frequency != "" {
		switch o.Frequency {
		case OneTime, Monthly, Yearly:
			q.Set("frequency", string(o.Frequency))
		default:
			problems = append(problems, fmt.Sprintf("invalid frequency %q", o.Frequency))
		}
	}
	if len(problems) > 0 {
		return q, newError(CodeInvalidConfig, strings.Join(problems, "; "), nil)
	}
	return q, nil
}

// CheckoutURL returns a link to the /checkout page without sign-in. It is
// synchronous and offline-safe, which suits nags and READMEs; a checkout
// started this way cannot be detected. Invalid options are left out of the URL.
func (c *Client) CheckoutURL(opts CheckoutOptions) string {
	q, _ := c.checkoutQuery(opts)
	return c.apiBaseURL + "/checkout?" + q.Encode()
}

// OpenCheckout sends the user to contribute and waits for the result
// (SPEC §7.3): it signs in first if needed (so the new contribution can be
// detected), opens /checkout in the browser, then polls with a zero cache TTL
// until a new or changed contribution appears. Timeout or cancellation of ctx
// resolves with CheckoutUnknown, not an error.
//
// Errors: disabled, invalid_config, and the SignIn errors when a sign-in was
// needed and failed.
func (c *Client) OpenCheckout(ctx context.Context, opts CheckoutOptions) (*CheckoutResult, error) {
	if c.disabled {
		return nil, newError(CodeDisabled, "Sponsorkit is disabled (SPONSORKIT_DISABLE)", nil)
	}
	query, err := c.checkoutQuery(opts)
	if err != nil {
		return nil, err
	}
	c.mu.Lock()
	if c.mock != nil {
		ct := mockCheckoutContribution(c.targets, opts)
		next := []Contribution{}
		for _, x := range c.mock.contributions {
			if x.ID != ct.ID {
				next = append(next, x)
			}
		}
		c.mock = &mockState{signedIn: true, contributions: append(next, ct)}
		c.mu.Unlock()
		return &CheckoutResult{Status: CheckoutContributed, Contribution: &ct}, nil
	}
	c.mu.Unlock()

	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = defaultCheckoutTimeout
	}
	interval := opts.PollInterval
	if interval <= 0 {
		interval = c.pollInterval
	}
	pctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	if err := c.devCheck(pctx); err != nil {
		return nil, err
	}
	checkoutURL := c.apiBaseURL + "/checkout?" + query.Encode()
	var baseline *Result
	stored := c.store().read()
	if stored.token() != "" {
		if stored.Cache != nil {
			baseline = &stored.Cache.Result
		} else {
			baseline = c.refresh(pctx, 0)
		}
		if err := c.openBrowser(pctx, checkoutURL); err != nil {
			fmt.Fprintf(c.stderr, "Open this URL in your browser to contribute:\n\n  %s\n\n", checkoutURL)
		}
	} else {
		verifier := NewCodeVerifier()
		params := cloneValues(query)
		params.Set("challenge", CodeChallenge(verifier))
		code, err := c.obtainCode(pctx, codeRequest{
			path:        "/checkout",
			params:      params,
			method:      opts.SignInMethod,
			continueURL: checkoutURL + "&step=choose",
		})
		if err != nil {
			if pctx.Err() != nil {
				return &CheckoutResult{Status: CheckoutUnknown}, nil
			}
			return nil, err
		}
		if baseline, err = c.exchange(pctx, code, verifier); err != nil {
			if pctx.Err() != nil {
				return &CheckoutResult{Status: CheckoutUnknown}, nil
			}
			return nil, err
		}
	}
	return c.poll(pctx, baseline, interval), nil
}

func contributionKey(ct Contribution) string {
	b, _ := json.Marshal(ct)
	return string(b)
}

// poll refreshes until a new or changed contribution appears or ctx ends.
func (c *Client) poll(ctx context.Context, baseline *Result, interval time.Duration) *CheckoutResult {
	before := map[string]string{}
	for _, ct := range baseline.Contributions {
		before[ct.ID] = contributionKey(ct)
	}
	timer := time.NewTimer(0)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return &CheckoutResult{Status: CheckoutUnknown}
		case <-timer.C:
		}
		r := c.refresh(ctx, 0)
		if ctx.Err() != nil {
			return &CheckoutResult{Status: CheckoutUnknown}
		}
		for i := range r.Contributions {
			ct := r.Contributions[i]
			if prev, ok := before[ct.ID]; !ok || prev != contributionKey(ct) {
				return &CheckoutResult{Status: CheckoutContributed, Contribution: &ct}
			}
		}
		timer.Reset(interval)
	}
}
