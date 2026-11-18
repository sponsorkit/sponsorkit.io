/** Provider OAuth start/callback (PROTOCOL §4.3, §4.4). */
import { OAUTH_START_FIELDS, Provider, SITE_PATHS, siteUrl } from "@sponsorkit/shared";
import { Hono, type Context } from "hono";
import { base64urlEncode, randomBytes, sha256, timingSafeEqual } from "../encoding";
import { ConfigError, publicOrigin, siteBaseUrl, siteConfig } from "../env";
import type { AppEnv } from "../hono";
import { htmlErrorPage } from "../html";
import { describeError, logEvent } from "../log";
import { parseStartParams, ParamError } from "../params";
import { CODE_TTL, CodePayload, PASTE_CODE_TTL, STATE_TTL, StatePayload, type SealedIdentity } from "../payloads";
import { challengeFor, generateVerifier } from "../pkce";
import { getAdapter } from "../providers";
import { clientIp, allow } from "../ratelimit";
import { loadSealingKeys, nowSeconds, seal, SealError, unseal } from "../seal";

export const NONCE_COOKIE = "__Host-sk_nonce";
/**
 * The nonce cookie outlives the state by this much. Browsers drop a cookie at Max-Age, so a
 * cookie that expired together with the state would turn every expired flow into the "another
 * browser" page; this way an expired-but-bound state still reaches the `invalid_state` delivery
 * (PROTOCOL §4.4).
 */
export const NONCE_GRACE = 600;
const NONCE_RE = /^[A-Za-z0-9_-]{43}$/;

export type DeliveryError = "access_denied" | "invalid_state" | "provider_error";

export const oauth = new Hono<AppEnv>();

oauth.use("*", async (c, next) => {
  const ip = clientIp(c.req.raw);
  if (!(await allow(c.env.RL_IP, `ip:${ip}`)) || !(await allow(c.env.RL_AUTH, `auth:${ip}`))) {
    const res = htmlErrorPage(429, "Too many requests", "Please wait a minute and try again.", c.get("requestId"));
    res.headers.set("Retry-After", "60");
    return res;
  }
  await next();
});

function routeProvider(c: Context<AppEnv>): Provider | null {
  const p = Provider.safeParse(c.req.param("provider"));
  return p.success ? p.data : null;
}

function callbackUrl(c: Context<AppEnv>, provider: Provider): string {
  return `${publicOrigin(c.env, c.req.url)}/api/oauth/${provider}/callback`;
}

function nonceCookie(value: string, maxAge: number): string {
  return `${NONCE_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function withClearedCookie(res: Response): Response {
  res.headers.append("Set-Cookie", nonceCookie("", 0));
  return res;
}

function configErrorPage(c: Context<AppEnv>, e: unknown): Response {
  logEvent("error", { msg: "oauth_config_error", error: describeError(e), requestId: c.get("requestId") });
  return htmlErrorPage(500, "Sign-in unavailable", "Sponsorkit is not configured correctly. Please try again later.", c.get("requestId"));
}

// ---------- POST /api/oauth/:provider/start ----------

/** Largest accepted form body (PROTOCOL §4.3 step 1). */
export const START_BODY_LIMIT = 8 * 1024;

/** Sign-in params carried from the start request to the consent page link (PROTOCOL §4.3 step 2). */
const CONSENT_PARAMS = OAUTH_START_FIELDS.filter((k) => k !== "continue");

/**
 * Why a start request may not proceed, or null when it came from the consent screen (PROTOCOL
 * §4.3 step 2): the browser-set `Origin` must be exactly the site origin (a missing or `null`
 * Origin fails closed), and a `Sec-Fetch-Dest` other than `document` (a framed submit) is refused.
 */
export function startRejection(req: Request, siteOrigin: string): "origin_missing" | "origin_null" | "origin_mismatch" | "framed" | null {
  const origin = req.headers.get("Origin");
  if (origin === null) return "origin_missing";
  if (origin === "null") return "origin_null";
  if (origin !== siteOrigin) return "origin_mismatch";
  const dest = req.headers.get("Sec-Fetch-Dest");
  if (dest !== null && dest !== "document") return "framed";
  return null;
}

/**
 * The consent page for these start params, on the site: `/checkout/` when a `continue` value is
 * present (§4.6; sign-in params already in `continue` are not repeated), else `/connect/`.
 */
export function consentUrlFor(siteBase: string, params: URLSearchParams): string {
  const q = new URLSearchParams();
  for (const key of CONSENT_PARAMS) {
    const v = params.get(key);
    if (v !== null) q.set(key, v);
  }
  const cont = params.get("continue");
  if (cont !== null && cont !== "") {
    const merged = new URLSearchParams(cont);
    for (const [k, v] of q) if (!merged.has(k)) merged.set(k, v);
    return siteUrl(siteBase, SITE_PATHS.checkout, merged);
  }
  return siteUrl(siteBase, SITE_PATHS.connect, q);
}

class BodyError extends Error {}

/** Read an `application/x-www-form-urlencoded` body of at most START_BODY_LIMIT bytes. */
async function readFormBody(req: Request): Promise<URLSearchParams> {
  const type = (req.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") throw new BodyError("The request body must be a form (application/x-www-form-urlencoded).");
  const declared = req.headers.get("Content-Length");
  if (declared !== null && Number(declared) > START_BODY_LIMIT) throw new BodyError("The request body is too large.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > START_BODY_LIMIT) {
        await reader.cancel().catch(() => {});
        throw new BodyError("The request body is too large.");
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let off = 0;
  for (const ch of chunks) {
    bytes.set(ch, off);
    off += ch.byteLength;
  }
  return new URLSearchParams(new TextDecoder().decode(bytes));
}

oauth.post("/:provider/start", async (c) => {
  const requestId = c.get("requestId");
  const provider = routeProvider(c);
  if (!provider) return htmlErrorPage(404, "Unknown provider", "This sign-in provider is not supported.", requestId);

  // Step 1: parse and validate the form body (the query string is ignored).
  let form: URLSearchParams;
  let params;
  try {
    form = await readFormBody(c.req.raw);
    params = parseStartParams(form, provider);
  } catch (e) {
    if (e instanceof BodyError || e instanceof ParamError) return htmlErrorPage(400, "Invalid sign-in request", e.message, requestId);
    throw e;
  }

  let site;
  try {
    site = siteConfig(c.env, c.req.url);
  } catch (e) {
    if (e instanceof ConfigError) return configErrorPage(c, e);
    throw e;
  }

  // Step 2: only the consent screen on the site origin may start sign-in.
  const rejection = startRejection(c.req.raw, site.siteOrigin);
  if (rejection) {
    logEvent("warn", { msg: "oauth_start_without_consent", provider, reason: rejection, requestId });
    return htmlErrorPage(
      403,
      "Review this sign-in first",
      "This sign-in request did not come from Sponsorkit's consent screen. Continue to review who is asking and what will be checked.",
      requestId,
      { href: consentUrlFor(site.siteBaseUrl, form), label: "Review and continue" },
    );
  }

  try {
    const keys = await loadSealingKeys(c.env.SEALING_KEYS);
    const adapter = getAdapter(c.env, provider);
    const nonce = base64urlEncode(randomBytes(32));
    const providerVerifier = generateVerifier();
    const state: StatePayload = {
      p: provider,
      t: params.targetParam,
      d: params.delivery,
      c: params.challenge,
      n: base64urlEncode(await sha256(nonce)),
      v: providerVerifier,
      x: nowSeconds() + STATE_TTL,
    };
    if (params.origin) state.o = params.origin;
    if (params.redirectUri) state.r = params.redirectUri;
    if (params.appName) state.a = params.appName;
    if (params.continueValue) state.k = params.continueValue;

    const location = adapter.authorizeUrl({
      redirectUri: callbackUrl(c, provider),
      state: await seal("state", state, keys),
      codeChallenge: await challengeFor(providerVerifier),
    });
    return redirect(location, nonceCookie(nonce, STATE_TTL + NONCE_GRACE));
  } catch (e) {
    if (e instanceof ConfigError) return configErrorPage(c, e);
    throw e;
  }
});

// Step 0: sign-in starts only with the consent screen's form POST. Links (GET) and everything
// else get a 405 that points at the consent screen, with no cookie and no redirect.
oauth.all("/:provider/start", (c) => {
  const res = htmlErrorPage(
    405,
    "Start sign-in from the consent screen",
    "Sign-in starts on Sponsorkit's consent screen, where you can review who is asking and what will be checked.",
    c.get("requestId"),
    { href: consentUrlFor(siteBaseUrl(c.env, c.req.url), new URL(c.req.url).searchParams), label: "Review and continue" },
  );
  res.headers.set("Allow", "POST");
  return res;
});

// ---------- GET /api/oauth/:provider/callback ----------

oauth.get("/:provider/callback", async (c) => {
  const requestId = c.get("requestId");
  const provider = routeProvider(c);
  if (!provider) return htmlErrorPage(404, "Unknown provider", "This sign-in provider is not supported.", requestId);

  let keys;
  let site;
  try {
    keys = await loadSealingKeys(c.env.SEALING_KEYS);
    site = siteConfig(c.env, c.req.url);
  } catch (e) {
    if (e instanceof ConfigError) return withClearedCookie(configErrorPage(c, e));
    throw e;
  }

  const stateParam = c.req.query("state");
  let state: StatePayload;
  try {
    if (!stateParam) throw new SealError("missing state");
    // Expiry is checked below, after the browser binding, so an expired flow can still be
    // reported back to the app as `invalid_state`.
    state = await unseal("state", stateParam, keys, StatePayload, { ignoreExpiry: true });
    if (state.p !== provider) throw new SealError("provider mismatch");
  } catch (e) {
    if (!(e instanceof SealError)) throw e;
    return withClearedCookie(
      htmlErrorPage(400, "Sign-in link invalid", "This sign-in attempt could not be verified. Please start again from the app.", requestId),
    );
  }

  // Browser binding: the nonce cookie set by /start must hash to the value sealed in the state.
  const cookieNonce = readCookie(c.req.header("Cookie"), NONCE_COOKIE);
  const nonceOk = !!cookieNonce && NONCE_RE.test(cookieNonce) && timingSafeEqual(base64urlEncode(await sha256(cookieNonce)), state.n);
  if (!nonceOk) {
    return withClearedCookie(
      htmlErrorPage(
        400,
        "Sign-in started in another browser",
        "This sign-in must be finished in the same browser it was started in. Please start again from the app.",
        requestId,
      ),
    );
  }

  const deliverError = (error: DeliveryError) => withClearedCookie(redirect(errorLocationFor(site.siteBaseUrl, state, error)));

  if (!(state.x > nowSeconds())) return deliverError("invalid_state");

  const providerError = c.req.query("error");
  if (providerError) return deliverError(providerError === "access_denied" ? "access_denied" : "provider_error");
  const code = c.req.query("code");
  if (!code) return deliverError("provider_error");

  let identity: SealedIdentity;
  try {
    const adapter = getAdapter(c.env, provider);
    const token = await adapter.exchangeCode(code, callbackUrl(c, provider), state.v);
    const who = await adapter.fetchIdentity(token.accessToken);
    identity = { p: provider, id: who.id, h: who.handle, tok: token.accessToken };
    if (token.expiresAt !== undefined) identity.tx = token.expiresAt;
  } catch (e) {
    logEvent("warn", { msg: "oauth_callback_failed", provider, error: describeError(e), requestId });
    return deliverError("provider_error");
  }

  const now = nowSeconds();
  const payload: CodePayload = {
    i: identity,
    t: state.t,
    c: state.c,
    d: state.d,
    x: now + (state.d === "paste" ? PASTE_CODE_TTL : CODE_TTL),
  };
  if (state.o) payload.o = state.o;
  if (state.r) payload.r = state.r;
  const skc = await seal("code", payload, keys);
  logEvent("info", { msg: "oauth_signed_in", provider, delivery: state.d, requestId });
  return withClearedCookie(redirect(codeLocationFor(site.siteBaseUrl, state, skc)));
});

// ---------- delivery ----------

function fragment(pairs: Array<[string, string | undefined]>): string {
  return pairs
    .filter((p): p is [string, string] => p[1] !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

function appendQuery(uri: string, key: string, value: string): string {
  const u = new URL(uri);
  u.searchParams.append(key, value);
  return u.toString();
}

/** `<siteBase>/connect/done/#<fragment>` (PROTOCOL §4.4: `/connect/done/` is a site page). */
function doneUrl(siteBase: string, frag: string): string {
  return `${siteUrl(siteBase, SITE_PATHS.connectDone)}#${frag}`;
}

/** PROTOCOL §4.4 delivery table. `siteBase` is the site base URL (SITE_BASE_URL). */
export function codeLocationFor(siteBase: string, state: StatePayload, skc: string): string {
  switch (state.d) {
    case "web_message":
      return doneUrl(siteBase, fragment([["code", skc], ["origin", state.o], ["continue", state.k]]));
    case "redirect":
      return appendQuery(state.r!, "sponsorkit_code", skc);
    case "loopback":
      return `${state.r!}?code=${encodeURIComponent(skc)}`;
    case "paste":
      return doneUrl(siteBase, fragment([["paste", skc], ["continue", state.k]]));
  }
}

export function errorLocationFor(siteBase: string, state: StatePayload, error: DeliveryError): string {
  switch (state.d) {
    case "web_message":
      return doneUrl(siteBase, fragment([["error", error], ["origin", state.o]]));
    case "redirect":
      return appendQuery(state.r!, "sponsorkit_error", error);
    case "loopback":
      return `${state.r!}?error=${encodeURIComponent(error)}`;
    case "paste":
      return doneUrl(siteBase, fragment([["error", error]]));
  }
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
