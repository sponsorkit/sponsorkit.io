package sponsorkit

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestReadLineDoesNotReadAhead(t *testing.T) {
	r := strings.NewReader("ABC\nuser-answer\n")
	l := &lineReader{r: r}
	got, err := l.line(context.Background())
	if got != "ABC" || err != nil {
		t.Fatalf("line = %q, %v", got, err)
	}
	rest, _ := io.ReadAll(r)
	if string(rest) != "user-answer\n" {
		t.Errorf("host input after the code was consumed: rest = %q", rest)
	}
}

func TestReadLineEOF(t *testing.T) {
	l := &lineReader{r: strings.NewReader("tail")}
	if got, err := l.line(context.Background()); got != "tail" || err != nil {
		t.Errorf("unterminated last line = %q, %v", got, err)
	}
	if _, err := l.line(context.Background()); err != io.EOF {
		t.Errorf("empty input: err = %v, want EOF", err)
	}
}

func TestLineReaderAbandonedReadGoesToNextPrompt(t *testing.T) {
	pr, pw := io.Pipe()
	l := &lineReader{r: pr}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := l.line(ctx); err != context.Canceled {
		t.Fatalf("cancelled prompt: err = %v", err)
	}
	go func() { _, _ = pw.Write([]byte("CODE\nnext\n")) }()
	got, err := l.line(context.Background())
	if got != "CODE" || err != nil {
		t.Fatalf("next prompt got %q, %v; the abandoned read's line was lost", got, err)
	}
	got, err = l.line(context.Background())
	if got != "next" || err != nil {
		t.Fatalf("following prompt got %q, %v", got, err)
	}
	_ = pw.Close()
}

func TestRunOpenerReportsNonZeroExit(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("uses POSIX true/false/sleep")
	}
	ctx := context.Background()
	if err := runOpener(ctx, "false", nil, 5*time.Second); err == nil {
		t.Error("an opener that exits non-zero must be reported as a failure")
	}
	if err := runOpener(ctx, "true", nil, 5*time.Second); err != nil {
		t.Errorf("exit 0: %v", err)
	}
	if err := runOpener(ctx, "sleep", []string{"5"}, 50*time.Millisecond); err != nil {
		t.Errorf("an opener still running after the wait counts as success: %v", err)
	}
	if err := runOpener(ctx, "sponsorkit-no-such-opener", nil, time.Second); err == nil {
		t.Error("a missing opener must be an error")
	}
}

func TestNoConfigDirKeepsStateInMemory(t *testing.T) {
	orig := defaultStorageDir
	defaultStorageDir = func() (string, error) { return "", os.ErrNotExist }
	t.Cleanup(func() { defaultStorageDir = orig; ResetProcessState() })
	wd := t.TempDir()
	prev, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(wd); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(prev) })
	c, err := New(Options{GitHub: "octocat", Env: map[string]string{}, Stderr: io.Discard})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := c.store().backend.(*memoryStorage); !ok {
		t.Fatalf("backend = %T, want in-memory storage", c.store().backend)
	}
	if err := c.store().backend.Write(c.hash, []byte(`{"v":1}`)); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(wd)
	if len(entries) != 0 {
		t.Errorf("state written to the working directory: %v", entries)
	}
}

func TestTokenExchange400InvalidRequestIsNetworkError(t *testing.T) {
	for _, tc := range []struct {
		body string
		want ErrorCode
	}{
		{`{"code":"invalid_code"}`, CodeInvalidCode},
		{`{"code":"invalid_request"}`, CodeNetworkError},
		{`not json`, CodeNetworkError},
	} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/problem+json")
			w.Header().Set("Retry-After", "7")
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, tc.body)
		}))
		c, err := New(Options{
			GitHub: "octocat", StorageDir: t.TempDir(), APIBaseURL: srv.URL,
			SignInMethod:  SignInPaste,
			PromptForCode: func(context.Context, string) (string, error) { return "skc_x", nil },
			Stderr:        io.Discard, Env: map[string]string{},
		})
		if err != nil {
			t.Fatal(err)
		}
		_, err = c.SignIn(context.Background())
		if got := ErrorCodeOf(err); got != tc.want {
			t.Errorf("400 %s: code %q, want %q (%v)", tc.body, got, tc.want, err)
		}
		if tc.want == CodeNetworkError {
			var e *Error
			if !errors.As(err, &e) || e.RetryAfter == nil || *e.RetryAfter != 7*time.Second {
				t.Errorf("400 %s: Retry-After not carried: %v", tc.body, err)
			}
		}
		srv.Close()
	}
}

// PROTOCOL §7: VerifySession carries Retry-After on any network_error response,
// not only on 429.
func TestVerifySessionRetryAfterOnUnexpectedStatus(t *testing.T) {
	for _, status := range []int{http.StatusTooManyRequests, http.StatusServiceUnavailable, http.StatusInternalServerError} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Retry-After", "30")
			w.WriteHeader(status)
		}))
		_, err := VerifySession(context.Background(), "tok", Targets{GitHub: "octocat"}, WithAPIBaseURL(srv.URL))
		var e *Error
		if !errors.As(err, &e) || e.Code != CodeNetworkError || e.RetryAfter == nil || *e.RetryAfter != 30*time.Second {
			t.Errorf("HTTP %d: want network_error with RetryAfter 30s, got %v", status, err)
		}
		srv.Close()
	}
}
