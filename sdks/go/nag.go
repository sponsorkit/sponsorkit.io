package sponsorkit

import (
	"context"
	"os"
	"time"
)

// NagOptions configures a nag (SPEC §7.5).
type NagOptions struct {
	// ID names the nag; state is kept per ID and target set.
	ID string
	// Every makes the nag due once it has been counted this many runs (one run
	// per process) since it was last shown.
	Every int
	// OrEvery makes the nag due once this much time has passed since it was last
	// shown, regardless of runs. Zero disables the clause. See ParseISODuration
	// for ISO-8601 input.
	OrEvery time.Duration
}

// Nag decides when to show a "please support" message. Create one with
// Client.Nag. It never signs the user in.
type Nag struct {
	c    *Client
	opts NagOptions
}

// DueOption customizes Nag.Due.
type DueOption func(*dueConfig)

type dueConfig struct{ force bool }

// Force bypasses the TTY, CI and SPONSORKIT_NO_NAG checks (but not
// SPONSORKIT_DISABLE).
func Force() DueOption { return func(d *dueConfig) { d.force = true } }

// Nag returns a nag helper:
//
//	nag := sk.Nag(sponsorkit.NagOptions{ID: "my-cli", Every: 10, OrEvery: 7 * 24 * time.Hour})
//	if nag.Due(ctx, func(r *sponsorkit.Result) bool { return len(r.Active()) == 0 }) {
//		fmt.Fprintln(os.Stderr, "Enjoying my-cli? Support it:", sk.CheckoutURL(sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly}))
//		nag.Shown()
//	}
func (c *Client) Nag(opts NagOptions) *Nag { return &Nag{c: c, opts: opts} }

func (n *Nag) store() *store {
	if n.c.mockNags != nil {
		return n.c.mockNags // mock mode: nag state lives in memory
	}
	return n.c.store()
}

// Due counts this run (once per process per ID) and reports whether the nag
// should be shown: predicate(result) && (runs >= Every || time since last
// shown >= OrEvery). A nil predicate counts as true. Due is always false when
// Sponsorkit is disabled, and, unless Force is given, when SPONSORKIT_NO_NAG
// or CI is set or stdout/stderr is not a terminal. Runs are counted even when
// the result is false.
func (n *Nag) Due(ctx context.Context, predicate func(*Result) bool, opts ...DueOption) bool {
	c := n.c
	if c.disabled || n.opts.ID == "" {
		return false
	}
	var d dueConfig
	for _, o := range opts {
		o(&d)
	}
	st := n.store()
	countKey := c.hash + ":" + n.opts.ID
	if c.IsMock() {
		countKey = "mock:" + countKey
	}
	processState.Lock()
	counted := processState.nagCounted[countKey]
	processState.nagCounted[countKey] = true
	processState.Unlock()
	if !counted {
		_ = st.update(func(f *storageFile) *storageFile {
			if f.Nags == nil {
				f.Nags = map[string]nagState{}
			}
			prev := f.Nags[n.opts.ID]
			prev.Runs++
			f.Nags[n.opts.ID] = prev
			return f
		})
	}
	if !d.force {
		if envSet(c.env("SPONSORKIT_NO_NAG")) || envSet(c.env("CI")) || !c.isInteractive() {
			return false
		}
	}
	if predicate != nil {
		r, err := c.GetFinancialContribution(ctx)
		if err != nil || !predicate(r) {
			return false
		}
	}
	state := st.read().Nags[n.opts.ID]
	if state.Runs >= n.opts.Every {
		return true
	}
	if n.opts.OrEvery > 0 && state.LastShown != nil {
		if at, ok := parseISOTime(*state.LastShown); ok {
			return c.now().Sub(at) >= n.opts.OrEvery
		}
	}
	return false
}

// Shown records that the nag was shown: it resets the run counter and sets
// the last-shown time.
func (n *Nag) Shown() {
	c := n.c
	if c.disabled || n.opts.ID == "" {
		return
	}
	entry := nagState{Runs: 0, LastShown: strPtr(isoTime(c.now()))}
	_ = n.store().update(func(f *storageFile) *storageFile {
		if f.Nags == nil {
			f.Nags = map[string]nagState{}
		}
		f.Nags[n.opts.ID] = entry
		return f
	})
}

func (c *Client) isInteractive() bool {
	if c.interactive != nil {
		return *c.interactive
	}
	return isTerminal(os.Stdout) && isTerminal(os.Stderr)
}
