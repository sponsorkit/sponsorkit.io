/**
 * Small, dependency-free crypto helpers shared by the fake server, the fixture
 * generator and the tests. Everything here mirrors PROTOCOL §1, §2 and the
 * contribution id rule in packages/shared (Contribution.id).
 */

const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export async function sha256(data: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(data)));
}

export async function sha256Hex(data: string): Promise<string> {
  return Buffer.from(await sha256(data)).toString("hex");
}

/** PROTOCOL §2: `code_verifier` alphabet and length. */
export const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

/** PROTOCOL §2: an S256 challenge is base64url(sha256) without padding, always 43 characters. */
export const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** PROTOCOL §2: `code_challenge = base64url(sha256(ascii(code_verifier)))`, no padding. */
export async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(await sha256(verifier));
}

/** Constant-time comparison of two ASCII strings. */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Contribution id rule: `con_<provider>_<base64url(sha256(provider + ":" + externalId)) first 22 chars>`. */
export async function contributionId(provider: string, externalId: string): Promise<string> {
  return `con_${provider}_${base64url(await sha256(`${provider}:${externalId}`)).slice(0, 22)}`;
}

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** RFC 4648 base32, lowercase, without padding. */
export function base32(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(buffer << (5 - bits)) & 31];
  return out;
}

/**
 * The fake server's pairwise supporter id (SPEC §5.4). The real Worker uses a
 * secret pairwise key; the fake uses a fixed one so ids are reproducible.
 * SDKs must treat supporter ids as opaque strings.
 */
export async function pairwiseSupporterId(targetsHash: string, provider: string, externalUserId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode("sponsorkit-conformance-pairwise-key"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${targetsHash}:${provider}:${externalUserId}`)),
  );
  return `sup_${base32(mac).slice(0, 26)}`;
}

/** Opaque random token with the given prefix (`sks_`, `skc_`, `req_`). */
export function randomToken(prefix: string, bytes = 32): string {
  return prefix + base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
