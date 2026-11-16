/** Provider OAuth start/callback (PROTOCOL §4.3, §4.4). */
import { Provider } from "@sponsorkit/shared";
import { Hono, type Context } from "hono";
import { base64urlEncode, randomBytes, sha256, timingSafeEqual } from "../encoding";
import { ConfigError, publicOrigin } from "../env";
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

// ---------- GET /api/oauth/:provider/start ----------

/**
 * Whether the navigation to /start came from Sponsorkit's own pages (the /connect or /checkout
 * consent screen). Browsers that send Fetch Metadata mark a navigation from another site, or one
 * with no initiator (pasted URL), as `cross-site` / `none`. Those skip the consent screen, which
 * is the only place the user sees who is asking and for which targets (SPEC §5.4), and providers
 * don't re-prompt for an app the user already authorized. Without the header (old browsers,
 * non-browser clients) there is nothing to check.
 */
export function startInitiatedByConsent(req: Request): boolean {
  const site = req.headers.get("Sec-Fetch-Site");
  return site === null || site === "same-origin" || site === "same-site";
}

/** The consent page for these /start params: /checkout when a `continue` value is present (§4.6), else /connect. */
export function consentUrlFor(origin: string, query: URLSearchParams): string {
  const q = new URLSearchParams();
  for (const key of ["targets", "challenge", "delivery", "origin", "redirect_uri", "app_name", "provider", "add"]) {
    const v = query.get(key);
    if (v !== null) q.set(key, v);
  }
  const cont = query.get("continue");
  if (cont !== null) {
    const merged = new URLSearchParams(cont);
    for (const [k, v] of q) if (!merged.has(k)) merged.set(k, v);
    return `${origin}/checkout?${merged.toString()}`;
  }
  return `${origin}/connect?${q.toString()}`;
}

oauth.get("/:provider/start", async (c) => {
  const provider = routeProvider(c);
  if (!provider) return htmlErrorPage(404, "Unknown provider", "This sign-in provider is not supported.", c.get("requestId"));

  let params;
  const query = new URL(c.req.url).searchParams;
  try {
    params = parseStartParams(query, provider);
  } catch (e) {
    if (e instanceof ParamError) return htmlErrorPage(400, "Invalid sign-in link", e.message, c.get("requestId"));
    throw e;
  }

  if (!startInitiatedByConsent(c.req.raw)) {
    logEvent("warn", { msg: "oauth_start_without_consent", provider, site: c.req.header("Sec-Fetch-Site") ?? null, requestId: c.get("requestId") });
    return htmlErrorPage(
      403,
      "Review this sign-in first",
      "This sign-in link skipped Sponsorkit's consent screen. Continue to review who is asking and what will be checked.",
      c.get("requestId"),
      { href: consentUrlFor(publicOrigin(c.env, c.req.url), query), label: "Review and continue" },
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

// ---------- GET /api/oauth/:provider/callback ----------

oauth.get("/:provider/callback", async (c) => {
  const requestId = c.get("requestId");
  const provider = routeProvider(c);
  if (!provider) return htmlErrorPage(404, "Unknown provider", "This sign-in provider is not supported.", requestId);

  let keys;
  try {
    keys = await loadSealingKeys(c.env.SEALING_KEYS);
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

  const deliverError = (error: DeliveryError) => withClearedCookie(redirect(errorLocation(c, state, error)));

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
  return withClearedCookie(redirect(codeLocation(c, state, skc)));
});

// ---------- delivery ----------

function siteUrl(c: Context<AppEnv>, path: string): string {
  return `${publicOrigin(c.env, c.req.url)}${path}`;
}

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

/** PROTOCOL §4.4 delivery table. */
export function codeLocationFor(origin: string, state: StatePayload, skc: string): string {
  switch (state.d) {
    case "web_message":
      return `${origin}/connect/done#${fragment([["code", skc], ["origin", state.o], ["continue", state.k]])}`;
    case "redirect":
      return appendQuery(state.r!, "sponsorkit_code", skc);
    case "loopback":
      return `${state.r!}?code=${encodeURIComponent(skc)}`;
    case "paste":
      return `${origin}/connect/done#${fragment([["paste", skc], ["continue", state.k]])}`;
  }
}

export function errorLocationFor(origin: string, state: StatePayload, error: DeliveryError): string {
  switch (state.d) {
    case "web_message":
      return `${origin}/connect/done#${fragment([["error", error], ["origin", state.o]])}`;
    case "redirect":
      return appendQuery(state.r!, "sponsorkit_error", error);
    case "loopback":
      return `${state.r!}?error=${encodeURIComponent(error)}`;
    case "paste":
      return `${origin}/connect/done#${fragment([["error", error]])}`;
  }
}

function codeLocation(c: Context<AppEnv>, state: StatePayload, skc: string): string {
  return codeLocationFor(siteUrl(c, ""), state, skc);
}

function errorLocation(c: Context<AppEnv>, state: StatePayload, error: DeliveryError): string {
  return errorLocationFor(siteUrl(c, ""), state, error);
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
