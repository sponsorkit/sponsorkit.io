/** Derived identifiers: pairwise supporter ids and stable contribution ids. */
import type { Provider } from "@sponsorkit/shared";
import { base32Lower, base64urlEncode, hex, sha256, utf8 } from "./encoding";
import { requireSecret, type Env } from "./env";

const hmacKeyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let k = hmacKeyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    hmacKeyCache.set(secret, k);
  }
  return k;
}

/** targets_hash: lowercase hex SHA-256 of the canonical target param (PROTOCOL §1). */
export async function targetsHashOfParam(targetParam: string): Promise<string> {
  return hex(await sha256(targetParam));
}

/**
 * Pairwise supporter id:
 * "sup_" + base32lower(HMAC-SHA256(PAIRWISE_KEY, targetsHash + "|" + provider + "|" + externalUserId)[0..20]).
 */
export async function supporterId(env: Env, targetParam: string, provider: Provider, externalUserId: string): Promise<string> {
  const key = await hmacKey(requireSecret(env, "PAIRWISE_KEY"));
  const th = await targetsHashOfParam(targetParam);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(`${th}|${provider}|${externalUserId}`)));
  return "sup_" + base32Lower(mac.slice(0, 20));
}

/** Contribution id: `con_<provider>_<base64url(sha256(provider + ":" + externalId)) first 22 chars>`. */
export async function contributionId(provider: Provider, externalId: string): Promise<string> {
  const digest = base64urlEncode(await sha256(`${provider}:${externalId}`));
  return `con_${provider}_${digest.slice(0, 22)}`;
}
