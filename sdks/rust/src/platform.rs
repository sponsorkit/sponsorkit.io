//! Platform helpers: opening the system browser, reading stdin, environment checks.

use std::io::IsTerminal as _;
use std::process::{Command, Stdio};

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

/// Opens `url` in the system browser.
pub(crate) fn open_system_browser(url: &str) -> std::io::Result<()> {
    let mut cmd = if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        c.arg(url);
        c
    } else if cfg!(windows) {
        // `start` treats the first quoted argument as the window title.
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", &url.replace('&', "^&")]);
        c
    } else {
        let mut c = Command::new("xdg-open");
        c.arg(url);
        c
    };
    let status = cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status()?;
    if status.success() { Ok(()) } else { Err(std::io::Error::other(format!("browser launcher exited with {status}"))) }
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
