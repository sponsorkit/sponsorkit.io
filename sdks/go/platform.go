package sponsorkit

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// envSet reports whether an environment value counts as set: non-empty and
// not "0" or "false" (case-insensitive).
func envSet(v string) bool {
	v = strings.TrimSpace(v)
	return v != "" && v != "0" && !strings.EqualFold(v, "false")
}

// OpenSystemBrowser opens url in the user's default browser without a shell:
// xdg-open on Linux and BSD, open on macOS, rundll32 on Windows. It is the
// default Options.OpenBrowser.
func OpenSystemBrowser(_ context.Context, url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	cmd.Stdin, cmd.Stdout, cmd.Stderr = nil, nil, nil
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}

// PromptStdin is the default Options.PromptForCode: it asks for the code on
// stderr and reads one line from stdin. The URL has already been printed.
func PromptStdin(ctx context.Context, _ string) (string, error) {
	fmt.Fprint(os.Stderr, "Sign-in code: ")
	type line struct {
		s   string
		err error
	}
	ch := make(chan line, 1)
	go func() {
		s, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err == io.EOF && s != "" {
			err = nil
		}
		ch <- line{s, err}
	}()
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case l := <-ch:
		return strings.TrimSpace(l.s), l.err
	}
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
