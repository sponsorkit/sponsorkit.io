//! Platform helpers: opening the system browser, reading stdin, environment checks.

use std::io::IsTerminal as _;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// Whether an environment value counts as *set*: non-empty and not `0` or
/// `false` (case-insensitive).
pub(crate) fn is_set(value: Option<&str>) -> bool {
    match value {
        None => false,
        Some(v) => {
            let v = v.trim();
            !(v.is_empty() || v == "0" || v.eq_ignore_ascii_case("false"))
        }
    }
}

/// How long to wait for the browser launcher to fail before assuming the
/// browser is opening. Some launchers (e.g. `xdg-open` running `$BROWSER` or a
/// first browser instance in the foreground) only exit when the browser does.
const LAUNCHER_GRACE: Duration = Duration::from_millis(1500);

/// Opens `url` in the system browser.
///
/// Blocks for at most [`LAUNCHER_GRACE`]: a launcher that exits non-zero within
/// that time is an error, one that is still running is assumed to be opening
/// the browser and is reaped on a detached thread.
pub(crate) fn open_system_browser(url: &str) -> std::io::Result<()> {
    let mut cmd = if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        c.arg(url);
        c
    } else if cfg!(windows) {
        // No shell involved, so the URL needs no quoting (as in the Go and JS SDKs).
        let mut c = Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", url]);
        c
    } else {
        let mut c = Command::new("xdg-open");
        c.arg(url);
        c
    };
    let child = cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn()?;
    wait_for_launcher(child, LAUNCHER_GRACE)
}

/// Waits up to `grace` for `child` to exit; see [`open_system_browser`].
pub(crate) fn wait_for_launcher(mut child: Child, grace: Duration) -> std::io::Result<()> {
    let deadline = Instant::now() + grace;
    loop {
        if let Some(status) = child.try_wait()? {
            return if status.success() {
                Ok(())
            } else {
                Err(std::io::Error::other(format!("browser launcher exited with {status}")))
            };
        }
        if Instant::now() >= deadline {
            // Still running: assume the browser is opening and reap it later.
            std::thread::spawn(move || {
                let _ = child.wait();
            });
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

/// Whether the system browser can plausibly be opened on this machine.
pub(crate) fn has_display() -> bool {
    let var = |k: &str| std::env::var_os(k).is_some_and(|v| !v.is_empty());
    if var("SSH_CONNECTION") || var("SSH_TTY") {
        return false;
    }
    if cfg!(any(target_os = "macos", windows)) {
        return true;
    }
    var("DISPLAY") || var("WAYLAND_DISPLAY")
}

/// Whether stdout and stderr are both terminals.
pub(crate) fn is_interactive() -> bool {
    std::io::stdout().is_terminal() && std::io::stderr().is_terminal()
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn sh(script: &str) -> Child {
        Command::new("sh").args(["-c", script]).spawn().expect("spawn sh")
    }

    #[test]
    fn launcher_outcomes() {
        assert!(wait_for_launcher(sh("exit 0"), Duration::from_secs(5)).is_ok());
        assert!(wait_for_launcher(sh("exit 3"), Duration::from_secs(5)).is_err());
        // A launcher that keeps running (browser in the foreground) counts as opened, promptly.
        let started = Instant::now();
        assert!(wait_for_launcher(sh("sleep 3"), Duration::from_millis(200)).is_ok());
        assert!(started.elapsed() < Duration::from_secs(5));
    }
}
