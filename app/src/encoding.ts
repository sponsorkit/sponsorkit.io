/** Byte/string encoding helpers (base64url, base32, hex) usable on Workers, Node and Bun. */

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function utf8(s: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(s) as Uint8Array<ArrayBuffer>;
}

export function fromUtf8(b: Uint8Array): string {
  return decoder.decode(b);
}

export function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const B64URL = /^[A-Za-z0-9_-]*$/;

/** Strict base64url (no padding) decoder. Throws on any invalid input. */
export function base64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  if (!B64URL.test(s) || s.length % 4 === 1) throw new Error("invalid base64url");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Plain base64 (with or without padding) decoder; throws on invalid input. */
export function base64Decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const B32 = "abcdefghijklmnopqrstuvwxyz234567";

/** RFC 4648 base32, lowercase, without padding. */
export function base32Lower(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256(data: string | Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const input = typeof data === "string" ? utf8(data) : data;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** Constant-time string comparison (both inputs are non-secret-length encodings). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
