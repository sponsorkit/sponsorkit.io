package sponsorkit

import "encoding/json"

// Provider identifies a sponsorship platform.
type Provider string

// Supported providers.
const (
	// GitHub is GitHub Sponsors.
	GitHub Provider = "github"
	// OpenCollective is Open Collective.
	OpenCollective Provider = "opencollective"
)

// Frequency is how often a contribution is charged.
type Frequency string

// Frequencies.
const (
	// OneTime is a single payment.
	OneTime Frequency = "one_time"
	// Monthly is charged every month.
	Monthly Frequency = "monthly"
	// Yearly is charged every year (Open Collective only).
	Yearly Frequency = "yearly"
)

// Kind distinguishes recurring from one-time contributions.
type Kind string

// Kinds.
const (
	// KindRecurring is a monthly or yearly contribution.
	KindRecurring Kind = "recurring"
	// KindOneTime is a single payment.
	KindOneTime Kind = "one_time"
)

// Status is a contribution status.
type Status string

// Statuses.
const (
	// StatusActive: recurring and current. One-time contributions are never
	// active.
	StatusActive Status = "active"
	// StatusPaused: recurring, paused (Open Collective).
	StatusPaused Status = "paused"
	// StatusCancelled: ended.
	StatusCancelled Status = "cancelled"
	// StatusPaid: a completed one-time contribution.
	StatusPaid Status = "paid"
	// StatusRefunded: refunded (Open Collective).
	StatusRefunded Status = "refunded"
	// StatusDisputed: charged back (Open Collective).
	StatusDisputed Status = "disputed"
	// StatusFailed: the payment failed or was rejected (Open Collective).
	StatusFailed Status = "failed"
	// StatusPending: not settled yet (Open Collective). Provider states
	// Sponsorkit does not know map to pending.
	StatusPending Status = "pending"
)

// Via says whether the supporter paid directly or through an organization.
type Via string

// Via values.
const (
	// ViaDirect: the supporter pays personally.
	ViaDirect Via = "direct"
	// ViaOrganization: an organization the supporter belongs to pays.
	ViaOrganization Via = "organization"
)

// Money is an amount in minor units (cents) of an ISO 4217 currency.
type Money struct {
	// Value is in minor units of Currency: 500 with "USD" is $5.00 (zero
	// decimals for JPY or KRW, three for KWD). It is 0 when GitHub hides the
	// tier amount.
	Value int64 `json:"value"`
	// Currency is the ISO 4217 code. GitHub is always "USD".
	Currency string `json:"currency"`
}

// SponsorEntity is who actually pays: the user or an organization they belong to.
type SponsorEntity struct {
	// Type is "user" or "organization".
	Type string `json:"type"`
	// Provider is where the sponsoring account lives.
	Provider Provider `json:"provider"`
	// ID is the provider's immutable account id.
	ID string `json:"id"`
	// Handle is the login or slug, or nil. Handles can change; key data on ID.
	Handle *string `json:"handle"`
}

// Tier is the provider tier of a contribution.
type Tier struct {
	// ID is the provider's tier id.
	ID string `json:"id"`
	// Name is the tier name shown by the provider.
	Name string `json:"name"`
}

// Contribution is one sponsorship (GitHub) or order (Open Collective),
// normalized to one shape across providers. Timestamps are ISO-8601 strings exactly as
// sent by the API.
type Contribution struct {
	// ID is stable, derived from the provider and its external id.
	ID string `json:"id"`
	// Provider is where the contribution was made.
	Provider Provider `json:"provider"`
	// Target is the target string, e.g. "github:octocat".
	Target string `json:"target"`
	// Sponsor is who pays: the supporter, or an organization they belong to.
	Sponsor SponsorEntity `json:"sponsor"`
	// Via is ViaDirect when the supporter pays personally and
	// ViaOrganization when an organization pays.
	Via Via `json:"via"`
	// Kind is KindRecurring or KindOneTime.
	Kind Kind `json:"kind"`
	// Frequency is Monthly, Yearly (Open Collective only) or OneTime.
	Frequency Frequency `json:"frequency"`
	// Status is one of the Status constants. One-time contributions are never
	// StatusActive; a completed one is StatusPaid.
	Status Status `json:"status"`
	// Amount is the amount per charge, in minor units.
	Amount Money `json:"amount"`
	// Tier is the provider tier, or nil when there is none.
	Tier *Tier `json:"tier"`
	// Flags may contain "via_patreon" (a GitHub sponsorship paid through
	// Patreon).
	Flags []string `json:"flags"`
	// Private is true when the supporter made the contribution private
	// (GitHub) or incognito (Open Collective). Don't display it publicly.
	Private bool `json:"private"`
	// StartedAt is when the contribution started, or nil.
	StartedAt *string `json:"startedAt"`
	// EndedAt is when the contribution ended, or nil.
	EndedAt *string `json:"endedAt"`
	// LastChargedAt is the last charge (Open Collective only), or nil.
	LastChargedAt *string `json:"lastChargedAt"`
	// NextChargeAt is the next charge (Open Collective only), or nil.
	NextChargeAt *string `json:"nextChargeAt"`
	// TotalContributed is everything paid so far (Open Collective only), or nil.
	TotalContributed *Money `json:"totalContributed"`
}

// MarshalJSON encodes a nil Flags slice as [].
func (c Contribution) MarshalJSON() ([]byte, error) {
	type plain Contribution
	p := plain(c)
	if p.Flags == nil {
		p.Flags = []string{}
	}
	return json.Marshal(p)
}

// Identity is one provider account of the signed-in supporter.
type Identity struct {
	// Provider is the provider of this account.
	Provider Provider `json:"provider"`
	// ID is the provider's immutable user id.
	ID string `json:"id"`
	// Handle is the login or slug, or nil. Handles can change.
	Handle *string `json:"handle"`
	// NeedsReconnect is true when the provider token expired or was revoked;
	// call SignIn with that provider to reconnect it.
	NeedsReconnect bool `json:"needsReconnect"`
}

// Supporter is the signed-in user.
type Supporter struct {
	// ID is pairwise: stable for the same person and target set.
	ID string `json:"id"`
	// Identities are the provider accounts linked to the session.
	Identities []Identity `json:"identities"`
}

// MarshalJSON encodes a nil Identities slice as [].
func (s Supporter) MarshalJSON() ([]byte, error) {
	type plain Supporter
	p := plain(s)
	if p.Identities == nil {
		p.Identities = []Identity{}
	}
	return json.Marshal(p)
}

// Result is what GetFinancialContribution returns. It serializes
// to exactly the protocol JSON shape.
type Result struct {
	// SignedIn is true when a session token is stored. When false, no
	// request was made.
	SignedIn bool `json:"signedIn"`
	// Disabled is true when SPONSORKIT_DISABLE is set: no network, no disk,
	// always signed out.
	Disabled bool `json:"disabled"`
	// Mock is true when the result comes from mock mode.
	Mock bool `json:"mock"`
	// Targets are the canonical target strings, e.g. ["github:octocat"].
	Targets []string `json:"targets"`
	// Supporter is the signed-in user, or nil when signed out.
	Supporter *Supporter `json:"supporter"`
	// Contributions are the supporter's contributions to the targets, from
	// both providers. Empty when signed out.
	Contributions []Contribution `json:"contributions"`
	// FetchedAt is when the API produced this data (ISO-8601), or nil when
	// nothing was fetched yet.
	FetchedAt *string `json:"fetchedAt"`
	// Stale is true when some provider could not be reached and its data (if
	// any) comes from the local cache.
	Stale bool `json:"stale"`
	// FromCache is true when the whole result was served from the local cache.
	FromCache bool `json:"fromCache"`
	// Unavailable lists providers the API could not query when this result was
	// fetched. It is kept when the result is served from the cache.
	Unavailable []Provider `json:"unavailable,omitempty"`
}

// MarshalJSON encodes nil slices as [].
func (r Result) MarshalJSON() ([]byte, error) {
	type plain Result
	p := plain(r)
	if p.Targets == nil {
		p.Targets = []string{}
	}
	if p.Contributions == nil {
		p.Contributions = []Contribution{}
	}
	return json.Marshal(p)
}

func (r *Result) filter(keep func(*Contribution) bool) []Contribution {
	out := []Contribution{}
	if r == nil {
		return out
	}
	for i := range r.Contributions {
		if keep(&r.Contributions[i]) {
			out = append(out, r.Contributions[i])
		}
	}
	return out
}

// Active returns the contributions whose status is "active". Helpers only
// filter; they never sum across providers or currencies.
func (r *Result) Active() []Contribution {
	return r.filter(func(c *Contribution) bool { return c.Status == StatusActive })
}

// Recurring returns the recurring contributions (any status).
func (r *Result) Recurring() []Contribution {
	return r.filter(func(c *Contribution) bool { return c.Kind == KindRecurring })
}

// OneTime returns the one-time contributions (any status).
func (r *Result) OneTime() []Contribution {
	return r.filter(func(c *Contribution) bool { return c.Kind == KindOneTime })
}

// ByProvider returns the contributions made through provider p.
func (r *Result) ByProvider(p Provider) []Contribution {
	return r.filter(func(c *Contribution) bool { return c.Provider == p })
}

// Direct returns the contributions paid by the user themselves, excluding
// organization sponsorships.
func (r *Result) Direct() []Contribution {
	return r.filter(func(c *Contribution) bool { return c.Via == ViaDirect })
}

// clone deep-copies a result through JSON so callers can never alias cached data.
func (r *Result) clone() *Result {
	b, err := json.Marshal(r)
	if err != nil {
		cp := *r
		return &cp
	}
	var out Result
	if err := json.Unmarshal(b, &out); err != nil {
		cp := *r
		return &cp
	}
	return &out
}

// CheckoutStatus is the outcome of OpenCheckout.
type CheckoutStatus string

// Checkout statuses.
const (
	// CheckoutContributed: a new or changed contribution was detected.
	CheckoutContributed CheckoutStatus = "contributed"
	// CheckoutUnknown: nothing was detected before the timeout or cancellation.
	// The supporter may still have paid.
	CheckoutUnknown CheckoutStatus = "unknown"
)

// CheckoutResult is returned by OpenCheckout.
type CheckoutResult struct {
	Status CheckoutStatus `json:"status"`
	// Contribution is set when Status is CheckoutContributed.
	Contribution *Contribution `json:"contribution,omitempty"`
}
