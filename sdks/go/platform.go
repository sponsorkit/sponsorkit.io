package sponsorkit

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// envSet reports whether an environment value counts as set: non-empty and
// not "0" or "false" (case-insensitive).
func envSet(v string) bool {
	v = strings.TrimSpace(v)
	return v != "" && v != "0" && !strings.EqualFold(v, "false")
}

// browserExitWait is how long OpenSystemBrowser waits for the opener to exit
// before assuming the browser is opening.
const browserExitWait = 1500 * time.Millisecond

// OpenSystemBrowser opens url in the user's default browser without a shell:
// xdg-open on Linux and BSD, open on macOS, rundll32 on Windows. It is the
// default Options.OpenBrowser.
//
// Openers exit quickly, so it waits up to 1.5 s: an opener that exits non-zero
// in that window (for example xdg-open with no browser available) is reported
// as an error, which lets SignInAuto fall back to paste-back. An opener still
// running after that is assumed to be opening the browser.
func OpenSystemBrowser(ctx context.Context, url string) error {
	var name string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		name, args = "open", []string{url}
	case "windows":
		name, args = "rundll32", []string{"url.dll,FileProtocolHandler", url}
	default:
		name, args = "xdg-open", []string{url}
	}
	return runOpener(ctx, name, args, browserExitWait)
}

// runOpener starts name with args and waits up to wait for it to exit. A
// start failure or a non-zero exit within wait is an error.
func runOpener(ctx context.Context, name string, args []string, wait time.Duration) error {
	cmd := exec.Command(name, args...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = nil, nil, nil
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	if ctx == nil {
		ctx = context.Background()
	}
	t := time.NewTimer(wait)
	defer t.Stop()
	select {
	case err := <-done:
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		return nil
	case <-t.C:
		return nil // still running: assume the browser is opening
	case <-ctx.Done():
		return nil // the caller's wait handles cancellation
	}
}

// lineReader reads one line at a time from r without read-ahead, so input
// after the line stays available to the host application. At most one read is
// in flight: a read abandoned by a cancelled prompt is handed to the next
// prompt instead of being lost to an orphaned goroutine.
type lineReader struct {
	r       io.Reader
	mu      sync.Mutex
	pending chan lineResult
}

type lineResult struct {
	s   string
	err error
}

// stdinLines serves PromptStdin. It is shared by all clients in the process.
var stdinLines = &lineReader{r: os.Stdin}

// readLine reads bytes up to and including '\n', one byte at a time.
func readLine(r io.Reader) (string, error) {
	var b strings.Builder
	buf := make([]byte, 1)
	for {
		n, err := r.Read(buf)
		if n == 1 {
			if buf[0] == '\n' {
				return b.String(), nil
			}
			b.WriteByte(buf[0])
		}
		if err != nil {
			if err == io.EOF && b.Len() > 0 {
				return b.String(), nil
			}
			return b.String(), err
		}
	}
}

// line returns the next line, or ctx.Err() if ctx ends first. A blocking read
// cannot be interrupted portably, so on cancellation the read stays in flight
// and its line is returned by the next call.
func (l *lineReader) line(ctx context.Context) (string, error) {
	l.mu.Lock()
	ch := l.pending
	if ch == nil {
		ch = make(chan lineResult, 1)
		l.pending = ch
		go func() {
			s, err := readLine(l.r)
			ch <- lineResult{s, err}
		}()
	}
	l.mu.Unlock()
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case res := <-ch:
		l.mu.Lock()
		if l.pending == ch {
			l.pending = nil
		}
		l.mu.Unlock()
		return strings.TrimSpace(res.s), res.err
	}
}

// PromptStdin is the default Options.PromptForCode: it asks for the code on
// stderr and reads one line from stdin. The URL has already been printed.
//
// It reads stdin byte by byte, so nothing after the code's line is consumed.
// A read cannot be interrupted: if ctx ends first (cancel or SignInTimeout),
// the read stays pending and the next line typed is taken by the next
// PromptStdin call, not by the host application. Supply your own
// PromptForCode if your program reads stdin after a cancelled sign-in.
func PromptStdin(ctx context.Context, _ string) (string, error) {
	fmt.Fprint(os.Stderr, "Sign-in code: ")
	return stdinLines.line(ctx)
}

// isTerminal reports whether f is a character device (a TTY).
func isTerminal(f *os.File) bool {
	if f == nil {
		return false
	}
	st, err := f.Stat()
	return err == nil && st.Mode()&os.ModeCharDevice != 0
}

var isoDuration = regexp.MustCompile(`^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$`)

// ParseISODuration parses an ISO-8601 duration made of weeks, days, hours,
// minutes and seconds, such as "P7D", "PT12H" or "P1DT30M". Years and months
// are not accepted because their length varies.
func ParseISODuration(s string) (time.Duration, error) {
	u := strings.ToUpper(strings.TrimSpace(s))
	m := isoDuration.FindStringSubmatch(u)
	if m == nil || u == "P" || strings.HasSuffix(u, "T") {
		return 0, newError(CodeInvalidConfig, fmt.Sprintf("invalid ISO-8601 duration %q", s), nil)
	}
	num := func(x string) float64 {
		if x == "" {
			return 0
		}
		f, _ := strconv.ParseFloat(x, 64)
		return f
	}
	secs := (num(m[1])*7+num(m[2]))*86400 + num(m[3])*3600 + num(m[4])*60 + num(m[5])
	return time.Duration(secs * float64(time.Second)), nil
}

// isoTime formats t like JavaScript's Date.toISOString (UTC, milliseconds).
func isoTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z07:00")
}

func parseISOTime(s string) (time.Time, bool) {
	t, err := time.Parse(time.RFC3339Nano, s)
	return t, err == nil
}
