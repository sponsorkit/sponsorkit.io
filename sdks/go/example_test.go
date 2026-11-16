package sponsorkit_test

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func Example() {
	ctx := context.Background()
	sk, err := sponsorkit.New(sponsorkit.Options{
		GitHub:         "octocat",
		OpenCollective: "webpack",
		AppName:        "my-cli",
		Mock:           sponsorkit.MockPreset("active-monthly"), // remove in production
	})
	if err != nil {
		log.Fatal(err)
	}
	fc, err := sk.GetFinancialContribution(ctx)
	if err != nil {
		log.Fatal(err) // only invalid_config from the dev-time target check
	}
	for _, c := range fc.Active() {
		fmt.Printf("%s %s %d %s\n", c.Provider, c.Frequency, c.Amount.Value, c.Amount.Currency)
	}
	// Output: github monthly 500 USD
}

func ExampleClient_SignIn() {
	ctx := context.Background()
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", AppName: "my-cli"})
	if err != nil {
		log.Fatal(err)
	}
	if !sk.IsSignedIn() {
		if _, err := sk.SignIn(ctx); err != nil {
			var skErr *sponsorkit.Error
			if errors.As(err, &skErr) && skErr.Code == sponsorkit.CodeAccessDenied {
				fmt.Fprintln(os.Stderr, "Sign-in cancelled.")
				return
			}
			log.Fatal(err)
		}
	}
}

func ExampleClient_OpenCheckout() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", Mock: sponsorkit.MockPreset("none")})
	if err != nil {
		log.Fatal(err)
	}
	r, err := sk.OpenCheckout(ctx, sponsorkit.CheckoutOptions{Amount: 500, Frequency: sponsorkit.Monthly})
	if err != nil {
		log.Fatal(err)
	}
	if r.Status == sponsorkit.CheckoutContributed {
		fmt.Println("Thank you!", r.Contribution.Amount.Value, r.Contribution.Amount.Currency)
	}
	// Output: Thank you! 500 USD
}

func ExampleClient_Nag() {
	ctx := context.Background()
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", AppName: "my-cli"})
	if err != nil {
		log.Fatal(err)
	}
	nag := sk.Nag(sponsorkit.NagOptions{ID: "my-cli", Every: 10, OrEvery: 7 * 24 * time.Hour})
	if nag.Due(ctx, func(fc *sponsorkit.Result) bool { return len(fc.Active()) == 0 }) {
		link, err := sk.CheckoutURL(sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly})
		if err != nil {
			log.Fatal(err)
		}
		fmt.Fprintln(os.Stderr, "Enjoying my-cli? Support it:", link)
		nag.Shown()
	}
}

func ExampleVerifySession() {
	http.HandleFunc("/api/pro-feature", func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("X-Sponsorkit-Session") // forwarded from Client.SessionToken()
		fc, err := sponsorkit.VerifySession(r.Context(), token, sponsorkit.Targets{GitHub: "octocat"})
		switch sponsorkit.ErrorCodeOf(err) {
		case "":
		case sponsorkit.CodeSessionInvalid, sponsorkit.CodeTargetsMismatch:
			http.Error(w, "sign in again", http.StatusUnauthorized)
			return
		default:
			http.Error(w, "try again later", http.StatusServiceUnavailable)
			return
		}
		if len(fc.Active()) == 0 {
			http.Error(w, "sponsors only", http.StatusPaymentRequired)
			return
		}
		fmt.Fprintln(w, "welcome, sponsor")
	})
}
