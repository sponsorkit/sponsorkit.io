//! Minimal UTC timestamp and ISO-8601 duration helpers (no date-time dependency).

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::error::{Error, Result};

/// Milliseconds since the Unix epoch.
pub(crate) fn now_ms() -> i64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_millis() as i64,
        Err(e) => -(e.duration().as_millis() as i64),
    }
}

// Howard Hinnant's civil-date algorithms.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Formats epoch milliseconds as `YYYY-MM-DDTHH:MM:SS.mmmZ`.
pub(crate) fn format_iso(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let millis = ms.rem_euclid(1000);
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{millis:03}Z", sod / 3600, (sod % 3600) / 60, sod % 60)
}

/// The current time as an ISO-8601 UTC string.
pub(crate) fn now_iso() -> String {
    format_iso(now_ms())
}

/// Parses an ISO-8601 date-time with `Z` or a `±HH:MM` offset into epoch milliseconds.
///
/// Returns `None` for anything malformed, including non-ASCII input (which
/// could otherwise make the byte-indexed slicing below land inside a character).
pub(crate) fn parse_iso(s: &str) -> Option<i64> {
    if !s.is_ascii() {
        return None;
    }
    let b = s.as_bytes();
    if b.len() < 20
        || b[4] != b'-'
        || b[7] != b'-'
        || !(b[10] == b'T' || b[10] == b't')
        || b[13] != b':'
        || b[16] != b':'
    {
        return None;
    }
    let num = |r: std::ops::Range<usize>| -> Option<i64> {
        let part = s.get(r)?;
        if !part.bytes().all(|c| c.is_ascii_digit()) {
            return None;
        }
        part.parse().ok()
    };
    let (y, mo, d, h, mi, se) = (num(0..4)?, num(5..7)?, num(8..10)?, num(11..13)?, num(14..16)?, num(17..19)?);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || se > 60 {
        return None;
    }
    let mut i = 19;
    let mut millis = 0i64;
    if b[i] == b'.' {
        i += 1;
        let start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == start {
            return None;
        }
        let frac = &s[start..i];
        let padded: String = frac.chars().chain(std::iter::repeat('0')).take(3).collect();
        millis = padded.parse().ok()?;
    }
    let offset_min = match &s[i..] {
        "Z" | "z" => 0,
        rest if rest.len() == 6 && (rest.starts_with('+') || rest.starts_with('-')) && &rest[3..4] == ":" => {
            let oh: i64 = rest[1..3].parse().ok()?;
            let om: i64 = rest[4..6].parse().ok()?;
            let sign = if rest.starts_with('-') { -1 } else { 1 };
            sign * (oh * 60 + om)
        }
        _ => return None,
    };
    let secs = days_from_civil(y, mo, d) * 86_400 + h * 3600 + mi * 60 + se - offset_min * 60;
    Some(secs * 1000 + millis)
}

/// Parses an ISO-8601 duration such as `P7D`, `PT12H`, `P1W` or `P1DT2H30M`.
///
/// Years and months are not supported (they have no fixed length); use days.
/// Returns an `invalid_config` error for anything else.
pub fn parse_iso_duration(s: &str) -> Result<Duration> {
    let err = || Error::invalid_config(format!("Invalid ISO-8601 duration \"{s}\""));
    let rest = s.strip_prefix('P').or_else(|| s.strip_prefix('p')).ok_or_else(err)?;
    if rest.is_empty() || rest.ends_with('T') {
        return Err(err());
    }
    let (date, time) = match rest.split_once(['T', 't']) {
        Some((d, t)) => (d, Some(t)),
        None => (rest, None),
    };
    let mut total = 0f64;
    let mut parse_part = |part: &str, units: &[(char, f64)]| -> Result<()> {
        let mut num = String::new();
        let mut next_unit = 0;
        for c in part.chars() {
            if c.is_ascii_digit() || c == '.' || c == ',' {
                num.push(if c == ',' { '.' } else { c });
                continue;
            }
            let c = c.to_ascii_uppercase();
            let idx = units[next_unit..].iter().position(|(u, _)| *u == c).ok_or_else(err)? + next_unit;
            let n: f64 = num.parse().map_err(|_| err())?;
            total += n * units[idx].1;
            num.clear();
            next_unit = idx + 1;
        }
        if num.is_empty() { Ok(()) } else { Err(err()) }
    };
    parse_part(date, &[('W', 604_800.0), ('D', 86_400.0)])?;
    if let Some(t) = time {
        parse_part(t, &[('H', 3600.0), ('M', 60.0), ('S', 1.0)])?;
    }
    Duration::try_from_secs_f64(total).map_err(|_| err())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_roundtrip() {
        let ms = parse_iso("2026-11-16T18:00:00.123Z").unwrap();
        assert_eq!(format_iso(ms), "2026-11-16T18:00:00.123Z");
        assert_eq!(parse_iso("2026-11-16T18:00:00Z").unwrap(), ms - 123);
        assert_eq!(parse_iso("2026-11-16T20:00:00+02:00").unwrap(), ms - 123);
        assert_eq!(parse_iso("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_iso("2000-01-01T00:00:00.000Z"), Some(946_684_800_000));
        assert!(parse_iso("nope").is_none());
        // Non-ASCII must be rejected, never panic on a char boundary.
        assert!(parse_iso("2026-11-16T18:00:00+0\u{e9}00").is_none());
        assert!(parse_iso("2026-11-16T18:00:00+\u{e9}:00").is_none());
        assert!(parse_iso("2026-11-16T18:00:00.\u{e9}Z").is_none());
        assert!(parse_iso("2026-11-16T18:00:00\u{1F600}00").is_none());
        assert!(parse_iso("2026-11-16T18:00:00+0\u{e9}0").is_none());
        assert!(parse_iso("2026-11-16 18:00:00Z").is_none());
    }

    #[test]
    fn durations() {
        assert_eq!(parse_iso_duration("P7D").unwrap(), Duration::from_secs(7 * 86_400));
        assert_eq!(parse_iso_duration("PT2S").unwrap(), Duration::from_secs(2));
        assert_eq!(parse_iso_duration("P1W").unwrap(), Duration::from_secs(604_800));
        assert_eq!(parse_iso_duration("P1DT2H30M").unwrap(), Duration::from_secs(86_400 + 9000));
        assert_eq!(parse_iso_duration("PT0.5S").unwrap(), Duration::from_millis(500));
        for bad in ["", "P", "PT", "7D", "P1Y", "PT1D", "P1H", "PxD"] {
            assert!(parse_iso_duration(bad).is_err(), "{bad}");
        }
    }
}
