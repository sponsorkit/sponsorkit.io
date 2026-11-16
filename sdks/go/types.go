package sponsorkit

import "encoding/json"

// Provider identifies a sponsorship platform.
type Provider string

// Supported providers.
const (
	GitHub         Provider = "github"
	OpenCollective Provider = "opencollective"
)

// Frequency is how often a contribution is charged.
type Frequency string

// Frequencies.
const (
	OneTime Frequency = "one_time"
	Monthly Frequency = "monthly"
	Yearly  Frequency = "yearly"
)

// Kind distinguishes recurring from one-time contributions.
type Kind string

// Kinds.
const (
	KindRecurring Kind = "recurring"
	KindOneTime   Kind = "one_time"
)

// Status is a contribution status (SPEC §5.2).
type Status string

// Statuses.
const (
	StatusActive    Status = "active"
	StatusPaused    Status = "paused"
	StatusCancelled Status = "cancelled"
	StatusPaid      Status = "paid"
	StatusRefunded  Status = "refunded"
	StatusDisputed  Status = "disputed"
	StatusFailed    Status = "failed"
	StatusPending   Status = "pending"
)

// Via says whether the supporter paid directly or through an organization.
type Via string

// Via values.
const (
	ViaDirect       Via = "direct"
	ViaOrganization Via = "organization"
)

// Money is an amount in minor units (cents) of an ISO 4217 currency.
type Money struct {
	Value    int64  `json:"value"`
	Currency string `json:"currency"`
}

// SponsorEntity is who actually pays: the user or an organization they belong to.
type SponsorEntity struct {
	// Type is "user" or "organization".
	Type     string   `json:"type"`
	Provider Provider `json:"provider"`
	ID       string   `json:"id"`
	Handle   *string  `json:"handle"`
}

// Tier is the provider tier of a contribution.
type Tier struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Contribution is one sponsorship (GitHub) or order (Open Collective),
// normalized to the SPEC §5.1 shape. Timestamps are ISO-8601 strings exactly as
// sent by the API.
type Contribution struct {
	// ID is stable, derived from the provider and its external id.
	ID       string   `json:"id"`
	Provider Provider `json:"provider"`
	// Target is the target string, e.g. "github:octocat".
	Target    string        `json:"target"`
	Sponsor   SponsorEntity `json:"sponsor"`
	Via       Via           `json:"via"`
	Kind      Kind          `json:"kind"`
	Frequency Frequency     `json:"frequency"`
	Status    Status        `json:"status"`
	Amount    Money         `json:"amount"`
	Tier      *Tier         `json:"tier"`
	// Flags may contain "via_patreon".
	Flags            []string `json:"flags"`
	Private          bool     `json:"private"`
	StartedAt        *string  `json:"startedAt"`
	EndedAt          *string  `json:"endedAt"`
	LastChargedAt    *string  `json:"lastChargedAt"`
	NextChargeAt     *string  `json:"nextChargeAt"`
	TotalContributed *Money   `json:"totalContributed"`
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
	Provider Provider `json:"provider"`
	ID       string   `json:"id"`
	Handle   *string  `json:"handle"`
	// NeedsReconnect is true when the provider token expired or was revoked;
	// call SignIn with that provider to reconnect it.
	NeedsReconnect bool `json:"needsReconnect"`
}

// Supporter is the signed-in user.
type Supporter struct {
	// ID is pairwise: stable for the same person and target set.
	ID         string     `json:"id"`
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

// Result is what GetFinancialContribution returns (SPEC §5.1). It serializes
// to exactly the protocol JSON shape.
type Result struct {
	SignedIn bool `json:"signedIn"`
	Disabled bool `json:"disabled"`
	Mock     bool `json:"mock"`
	// Targets are the canonical target strings, e.g. ["github:octocat"].
	Targets       []string       `json:"targets"`
	Supporter     *Supporter     `json:"supporter"`
	Contributions []Contribution `json:"contributions"`
	FetchedAt     *string        `json:"fetchedAt"`
	// Stale is true when some provider could not be reached and its data (if
	// any) comes from the local cache.
	Stale bool `json:"stale"`
	// FromCache is true when the whole result was served from the local cache.
	FromCache bool `json:"fromCache"`
	// Unavailable lists providers the API could not query (API results only).
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
