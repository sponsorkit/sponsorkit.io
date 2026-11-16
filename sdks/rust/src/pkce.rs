//! PKCE helpers (PROTOCOL §2, RFC 7636 S256).

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};

use crate::error::{Error, Result};

/// Encodes bytes as base64url without padding.
pub fn base64url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Fills a buffer with cryptographically secure random bytes.
pub(crate) fn random_bytes<const N: usize>() -> Result<[u8; N]> {
    let mut buf = [0u8; N];
    getrandom::fill(&mut buf).map_err(|e| Error::environment(format!("No secure random source: {e}")))?;
    Ok(buf)
}

/// Generates a fresh code verifier: 32 random bytes, base64url (43 characters).
pub fn generate_verifier() -> Result<String> {
    Ok(base64url(&random_bytes::<32>()?))
}

/// `code_challenge = base64url(sha256(ascii(code_verifier)))`, without padding.
pub fn code_challenge(verifier: &str) -> String {
    base64url(&Sha256::digest(verifier.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rfc7636_appendix_b() {
        assert_eq!(
            code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn verifier_shape() {
        let v = generate_verifier().unwrap();
        assert_eq!(v.len(), 43);
        assert!(v.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_'));
    }
}
