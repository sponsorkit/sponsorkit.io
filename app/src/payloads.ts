/** Plaintext schemas of sealed values (PROTOCOL §5). Field names are deliberately compact. */
import { Delivery, Provider } from "@sponsorkit/shared";
import { z } from "zod";

/** An identity with its provider token, as carried inside codes and sessions. */
export const SealedIdentity = z.object({
  p: Provider,
  /** Immutable provider user id. */
  id: z.string().min(1),
  /** Login / slug at sign-in time. */
  h: z.string().nullable(),
  /** Provider access token. */
  tok: z.string().min(1),
  /** Provider token expiry, unix seconds (Open Collective). */
  tx: z.number().int().optional(),
});
export type SealedIdentity = z.infer<typeof SealedIdentity>;

/** OAuth `state`. */
export const StatePayload = z.object({
  p: Provider,
  t: z.string(),
  d: Delivery,
  o: z.string().optional(),
  r: z.string().optional(),
  a: z.string().optional(),
  c: z.string(),
  /** base64url(sha256(browser_nonce)). */
  n: z.string(),
  /** Provider PKCE verifier. */
  v: z.string(),
  k: z.string().optional(),
  x: z.number().int(),
});
export type StatePayload = z.infer<typeof StatePayload>;

/** Sign-in code `skc_…`. */
export const CodePayload = z.object({
  i: SealedIdentity,
  t: z.string(),
  c: z.string(),
  d: Delivery,
  o: z.string().optional(),
  r: z.string().optional(),
  x: z.number().int(),
});
export type CodePayload = z.infer<typeof CodePayload>;

/** Session token `sks_…`. */
export const SessionPayload = z.object({
  v: z.literal(1),
  t: z.string(),
  ids: z.array(SealedIdentity).min(1),
  iat: z.number().int(),
  x: z.number().int(),
});
export type SessionPayload = z.infer<typeof SessionPayload>;

export const STATE_TTL = 600;
export const CODE_TTL = 60;
export const PASTE_CODE_TTL = 600;
export const SESSION_TTL = 180 * 24 * 3600;
export const RENEW_AFTER = 7 * 24 * 3600;
