//! Conformance suite: one test per scenario of `sdks/conformance/scenarios.json`,
//! run against the fake server (`bun sdks/conformance/server.ts`).
//!
//! Test names are the scenario ids with `-` replaced by `_`. The scenarios share
//! one fake server and run one at a time (see `common::run`).

mod common;

macro_rules! scenarios {
    ($($name:ident => $id:literal),* $(,)?) => {
        $(
            #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
            async fn $name() {
                common::run($id).await;
            }
        )*

        const IDS: &[&str] = &[$($id),*];
    };
}

scenarios! {
    config_no_targets => "config-no-targets",
    config_malformed_target => "config-malformed-target",
    config_normalizes_targets => "config-normalizes-targets",
    config_target_missing => "config-target-missing",
    config_dev_check_once => "config-dev-check-once",
    disabled_env => "disabled-env",
    disabled_beats_mock => "disabled-beats-mock",
    mock_preset_signed_out => "mock-preset-signed-out",
    mock_preset_none => "mock-preset-none",
    mock_preset_active_monthly => "mock-preset-active-monthly",
    mock_preset_one_time => "mock-preset-one-time",
    mock_preset_cancelled => "mock-preset-cancelled",
    mock_preset_org => "mock-preset-org",
    mock_preset_active_monthly_opencollective => "mock-preset-active-monthly-opencollective",
    mock_env_var => "mock-env-var",
    mock_option_beats_env => "mock-option-beats-env",
    mock_custom_contributions => "mock-custom-contributions",
    mock_invalid_preset => "mock-invalid-preset",
    mock_sign_in_checkout_sign_out => "mock-sign-in-checkout-sign-out",
    signed_out => "signed-out",
    sign_in_loopback => "sign-in-loopback",
    sign_in_paste => "sign-in-paste",
    sign_in_access_denied => "sign-in-access-denied",
    sign_in_add_identity => "sign-in-add-identity",
    sign_out => "sign-out",
    session_invalid => "session-invalid",
    session_renewal => "session-renewal",
    session_needs_reconnect => "session-needs-reconnect",
    cache_hit => "cache-hit",
    cache_read_protocol_file => "cache-read-protocol-file",
    cache_expired => "cache-expired",
    offline_with_cache => "offline-with-cache",
    offline_without_cache => "offline-without-cache",
    server_error_with_cache => "server-error-with-cache",
    server_error_without_cache => "server-error-without-cache",
    partial_outage => "partial-outage",
    partial_outage_without_cache => "partial-outage-without-cache",
    rate_limited => "rate-limited",
    rate_limited_without_cache => "rate-limited-without-cache",
    checkout_detects_new_contribution => "checkout-detects-new-contribution",
    checkout_detects_changed_contribution => "checkout-detects-changed-contribution",
    checkout_timeout => "checkout-timeout",
    checkout_cancelled => "checkout-cancelled",
    checkout_signs_in_first => "checkout-signs-in-first",
    checkout_url => "checkout-url",
    nag_run_counting => "nag-run-counting",
    nag_predicate => "nag-predicate",
    nag_suppressed => "nag-suppressed",
    nag_or_every => "nag-or-every",
    storage_permissions => "storage-permissions",
    storage_concurrent_writes => "storage-concurrent-writes",
    storage_per_target_set => "storage-per-target-set",
    verify_session_match => "verify-session-match",
    verify_session_mismatch => "verify-session-mismatch",
    verify_session_invalid => "verify-session-invalid",
    sign_in_cancelled => "sign-in-cancelled",
    sign_in_timeout => "sign-in-timeout",
    sign_in_token_server_error => "sign-in-token-server-error",
    sign_in_invalid_code => "sign-in-invalid-code",
    sign_in_add_identity_dead_session => "sign-in-add-identity-dead-session",
    verify_session_unreachable => "verify-session-unreachable",
    verify_session_rate_limited => "verify-session-rate-limited",
    verify_session_server_error => "verify-session-server-error",
    mock_nag_in_memory => "mock-nag-in-memory",
    checkout_url_invalid => "checkout-url-invalid",
    config_dev_checks_env => "config-dev-checks-env",
    config_dev_checks_default_off => "config-dev-checks-default-off",
    config_env_replaces_process_env => "config-env-replaces-process-env",
    config_cache_ttl_minimum => "config-cache-ttl-minimum",
    nag_interactive => "nag-interactive",
}

/// Fails when scenarios.json gains a scenario this file has no test for (or loses one).
#[test]
fn every_scenario_has_a_test() {
    let mut expected = common::scenario_ids();
    let mut actual: Vec<String> = IDS.iter().map(|s| s.to_string()).collect();
    expected.sort();
    actual.sort();
    assert_eq!(actual, expected, "tests/conformance.rs is out of sync with scenarios.json");
}
