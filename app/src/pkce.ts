/** PKCE (RFC 7636, S256 only) per PROTOCOL §2. */
import { base64urlEncode, randomBytes, sha256, timingSafeEqual } from "./encoding";

/** 43–128 chars from the unreserved set. */
export const CODE_VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
/** base64url(sha256(...)) without padding is always exactly 43 chars. */
export const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export function isValidVerifier(v: string): boolean {
  return CODE_VERIFIER_RE.test(v);
}

export function isValidChallenge(c: string): boolean {
  return CODE_CHALLENGE_RE.test(c);
}

/** 32 random bytes as base64url → 43-char verifier. */
export function generateVerifier(): string {
  return base64urlEncode(randomBytes(32));
}

export async function challengeFor(verifier: string): Promise<string> {
  return base64urlEncode(await sha256(verifier));
}

/** True when `verifier` is well-formed and hashes to `challenge`. */
export async function verifyChallenge(verifier: string, challenge: string): Promise<boolean> {
  if (!isValidVerifier(verifier) || !isValidChallenge(challenge)) return false;
  return timingSafeEqual(await challengeFor(verifier), challenge);
}
