/**
 * Sealed values (PROTOCOL §5): AES-256-GCM via Web Crypto.
 *
 *   <prefix> base64url( keyId(1) ‖ nonce(12) ‖ ciphertext+tag )
 *
 * AAD = "sponsorkit:<kind>:v1". The first key in SEALING_KEYS seals; all keys unseal.
 * Unsealing fails closed: any error (format, unknown key, auth tag, JSON, schema, expiry)
 * raises SealError and callers map it to `invalid_code` / `session_invalid`.
 */
import { z } from "zod";
import { base64urlDecode, base64urlEncode, fromUtf8, randomBytes, utf8 } from "./encoding";
import { ConfigError } from "./env";

export type SealKind = "state" | "code" | "session";

export const SEAL_PREFIX: Record<SealKind, string> = { state: "", code: "skc_", session: "sks_" };

export class SealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SealError";
  }
}

export interface SealingKey {
  id: number;
  key: CryptoKey;
}

const KeySpec = z
  .array(
    z.object({
      id: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).pipe(z.number().int().min(0).max(255)),
      key: z.string(),
    }),
  )
  .min(1);

const keyCache = new Map<string, Promise<SealingKey[]>>();

/** Parse and import SEALING_KEYS (cached per isolate by the raw JSON string). */
export function loadSealingKeys(raw: string | undefined): Promise<SealingKey[]> {
  if (!raw) return Promise.reject(new ConfigError("Missing configuration: SEALING_KEYS"));
  let cached = keyCache.get(raw);
  if (!cached) {
    cached = importKeys(raw);
    keyCache.set(raw, cached);
    cached.catch(() => keyCache.delete(raw));
  }
  return cached;
}

async function importKeys(raw: string): Promise<SealingKey[]> {
  let parsed: z.infer<typeof KeySpec>;
  try {
    parsed = KeySpec.parse(JSON.parse(raw));
  } catch {
    throw new ConfigError("SEALING_KEYS must be a JSON array of { id: 0-255, key: base64url(32 bytes) }");
  }
  const ids = new Set<number>();
  const out: SealingKey[] = [];
  for (const { id, key } of parsed) {
    if (ids.has(id)) throw new ConfigError("SEALING_KEYS contains duplicate ids");
    ids.add(id);
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = base64urlDecode(key);
    } catch {
      throw new ConfigError("SEALING_KEYS key is not base64url");
    }
    if (bytes.length !== 32) throw new ConfigError("SEALING_KEYS key must be 32 bytes");
    const cryptoKey = await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    out.push({ id, key: cryptoKey });
  }
  return out;
}

function aad(kind: SealKind): Uint8Array<ArrayBuffer> {
  return utf8(`sponsorkit:${kind}:v1`);
}

/** Seal `payload` (compact JSON) under the current (first) key. */
export async function seal(kind: SealKind, payload: unknown, keys: SealingKey[]): Promise<string> {
  const current = keys[0];
  if (!current) throw new ConfigError("No sealing key configured");
  const nonce = randomBytes(12);
  const plaintext = utf8(JSON.stringify(payload));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad(kind), tagLength: 128 }, current.key, plaintext),
  );
  const out = new Uint8Array(1 + 12 + ct.length);
  out[0] = current.id;
  out.set(nonce, 1);
  out.set(ct, 13);
  return SEAL_PREFIX[kind] + base64urlEncode(out);
}

/** Decrypt a sealed value and return the parsed JSON. Throws SealError on any failure. */
export async function unsealRaw(kind: SealKind, token: string, keys: SealingKey[]): Promise<unknown> {
  const prefix = SEAL_PREFIX[kind];
  if (typeof token !== "string" || !token.startsWith(prefix)) throw new SealError("bad prefix");
  // Bound the input: sessions are ~1 KB; reject absurd sizes before decoding.
  if (token.length > 16_384) throw new SealError("too long");
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64urlDecode(token.slice(prefix.length));
  } catch {
    throw new SealError("bad encoding");
  }
  // keyId + nonce + 16-byte tag at minimum.
  if (bytes.length < 1 + 12 + 16) throw new SealError("too short");
  const key = keys.find((k) => k.id === bytes[0]);
  if (!key) throw new SealError("unknown key");
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes.slice(1, 13), additionalData: aad(kind), tagLength: 128 },
        key.key,
        bytes.slice(13),
      ),
    );
  } catch {
    throw new SealError("decrypt failed");
  }
  try {
    return JSON.parse(fromUtf8(plain));
  } catch {
    throw new SealError("bad payload");
  }
}

/**
 * Unseal and validate against `schema`, enforcing the `x` (expiry, unix seconds) field.
 * Pass `ignoreExpiry` to inspect an expired value (used to deliver `invalid_state`).
 */
export async function unseal<S extends z.ZodType<{ x: number }>>(
  kind: SealKind,
  token: string,
  keys: SealingKey[],
  schema: S,
  opts: { now?: number; ignoreExpiry?: boolean } = {},
): Promise<z.infer<S>> {
  const raw = await unsealRaw(kind, token, keys);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new SealError("schema mismatch");
  const now = opts.now ?? nowSeconds();
  if (!opts.ignoreExpiry && !(parsed.data.x > now)) throw new SealError("expired");
  return parsed.data;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
