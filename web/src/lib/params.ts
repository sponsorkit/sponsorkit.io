/**
 * Query-parameter parsing for the supporter pages (PROTOCOL §4.1, §4.2, §4.6).
 *
 * Pure: no DOM access. Pages pass `new URLSearchParams(location.search)`.
 */
import {
  API_PATHS,
  Delivery,
  Frequency,
  InvalidTargetError,
  OAUTH_START_FIELDS,
  Provider,
  targetsFromParam,
  targetToString,
  trimTrailingSlashes,
  type Target,
} from "@sponsorkit/shared";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Everything needed to show the consent screen and start provider OAuth. */
export interface SignInParams {
  targets: Target[];
  /** Canonical target param (PROTOCOL §1). */
  targetsParam: string;
  challenge: string;
  delivery: Delivery;
  /** `web_message` only. */
  origin?: string;
  /** `redirect` and `loopback` only. */
  redirectUri?: string;
  appName?: string;
  provider?: Provider;
  add: boolean;
}

export interface CheckoutParams {
  targets: Target[];
  targetsParam: string;
  /** Present when the page must sign the user in first (challenge given and step ≠ choose). */
  signIn: SignInParams | null;
  /** Minor units. */
  amount?: number;
  /** ISO 4217, uppercase. */
  currency?: string;
  frequency?: Frequency;
  provider?: Provider;
  /** Opener origin, used only for the optional `sponsorkit:checkout_redirected` message. */
  origin?: string;
  appName?: string;
  step?: "choose";
}

/** Who is asking, as shown on the consent screen (PROTOCOL §4.2). */
export type Requester =
  | { kind: "web"; origin: string }
  | { kind: "redirect"; host: string }
  | { kind: "native"; appName: string | null; delivery: "loopback" | "paste" };

const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const LOOPBACK_V4 = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/callback$/;
const LOOPBACK_V6 = /^http:\/\/\[::1\]:(\d{1,5})\/callback$/;
const CURRENCY = /^[A-Za-z]{3}$/;
const AMOUNT = /^[0-9]{1,12}$/;
/**
 * Control (Cc) and format (Cf) characters, including bidi overrides and zero-width characters,
 * that could be used to spoof the "says it is" label. Same rule as the Worker's `/start` check.
 */
const UNSAFE_LABEL_CHARS = /[\p{Cc}\p{Cf}]/u;
/** Hosts on which a plain-http `web_message` origin is allowed (local development), as in the Worker. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
export const APP_NAME_MAX = 64;
export const AMOUNT_MAX = 100_000_000_00; // 100M major units; anything above is certainly a mistake.

/**
 * `true` if `value` is a serialized origin: https anywhere, or http on a loopback host
 * (`localhost`, `127.0.0.1`, `[::1]`), e.g. `https://app.example.com` or `http://localhost:5173`.
 * Matches the Worker's `/api/oauth/:provider/start` validation (PROTOCOL §4.1, §4.3).
 */
export function isValidOrigin(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.origin !== value) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

/** `redirect` delivery: an https URL, or http on localhost / 127.0.0.1 (PROTOCOL §4.1). */
export function isValidRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash || value.includes("#")) return false;
  if (url.protocol === "https:") return url.hostname.length > 0;
  if (url.protocol === "http:") return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return false;
}

/** `loopback` delivery: exactly `http://127.0.0.1:<port>/callback` or `http://[::1]:<port>/callback`. */
export function isValidLoopbackUri(value: string): boolean {
  const m = LOOPBACK_V4.exec(value) ?? LOOPBACK_V6.exec(value);
  if (!m) return false;
  const port = Number(m[1]);
  return Number.isInteger(port) && port >= 1 && port <= 65535 && String(port) === m[1];
}

function parseTargets(sp: URLSearchParams, errors: string[]): Target[] | null {
  const raw = sp.get("targets");
  if (raw === null || raw.trim() === "") {
    errors.push("The link is missing the accounts to check (targets).");
    return null;
  }
  try {
    return targetsFromParam(raw);
  } catch (e) {
    errors.push(e instanceof InvalidTargetError ? `${e.message}.` : "The accounts in this link (targets) are malformed.");
    return null;
  }
}

function parseProvider(sp: URLSearchParams, targets: Target[] | null, errors: string[]): Provider | undefined {
  const raw = sp.get("provider");
  if (raw === null || raw === "") return undefined;
  const p = Provider.safeParse(raw);
  if (!p.success) {
    errors.push(`Unknown provider "${raw}".`);
    return undefined;
  }
  if (targets && !targets.some((t) => t.provider === p.data)) {
    errors.push(`This link asks for ${p.data}, but no ${p.data} account is being checked.`);
    return undefined;
  }
  return p.data;
}

function parseAppName(sp: URLSearchParams, errors: string[]): string | undefined {
  const raw = sp.get("app_name");
  if (raw === null) return undefined;
  const v = raw.trim();
  if (v === "") return undefined;
  // Count code points, not UTF-16 units, like the Worker.
  if ([...v].length > APP_NAME_MAX) {
    errors.push(`The app name is longer than ${APP_NAME_MAX} characters.`);
    return undefined;
  }
  if (UNSAFE_LABEL_CHARS.test(v)) {
    errors.push("The app name contains characters that aren't allowed.");
    return undefined;
  }
  return v;
}

/** Validates the sign-in parameters shared by `/connect/` and `/checkout/` (PROTOCOL §4.1). */
function parseSignInParts(
  sp: URLSearchParams,
  targets: Target[] | null,
  errors: string[],
): Omit<SignInParams, "targets" | "targetsParam" | "provider" | "appName"> | null {
  const before = errors.length;
  const challenge = sp.get("challenge") ?? "";
  if (challenge === "") errors.push("The link is missing its security challenge.");
  else if (!CHALLENGE.test(challenge)) errors.push("The link's security challenge is malformed.");

  const deliveryRaw = sp.get("delivery");
  const d = Delivery.safeParse(deliveryRaw);
  let delivery: Delivery | null = null;
  if (!d.success) {
    errors.push(deliveryRaw ? `Unknown delivery method "${deliveryRaw}".` : "The link is missing its delivery method.");
  } else {
    delivery = d.data;
  }

  let origin: string | undefined;
  let redirectUri: string | undefined;
  if (delivery === "web_message") {
    const o = sp.get("origin") ?? "";
    if (o === "") errors.push("The link is missing the origin of the app that opened it.");
    else if (!isValidOrigin(o)) errors.push("The app origin in this link must be an https origin (or http on localhost).");
    else origin = o;
  } else if (delivery === "redirect") {
    const r = sp.get("redirect_uri") ?? "";
    if (r === "") errors.push("The link is missing its return address (redirect_uri).");
    else if (!isValidRedirectUri(r)) errors.push("The return address must be an https URL or a localhost URL.");
    else redirectUri = r;
  } else if (delivery === "loopback") {
    const r = sp.get("redirect_uri") ?? "";
    if (!isValidLoopbackUri(r)) errors.push("The return address must be http://127.0.0.1:<port>/callback or http://[::1]:<port>/callback.");
    else redirectUri = r;
  }

  if (errors.length > before || !delivery || !targets) return null;
  return {
    challenge,
    delivery,
    ...(origin !== undefined && { origin }),
    ...(redirectUri !== undefined && { redirectUri }),
    add: sp.get("add") === "1",
  };
}

/** Parse `/connect/` query parameters (PROTOCOL §4.1–4.2). */
export function parseConnectParams(sp: URLSearchParams): ParseResult<SignInParams> {
  const errors: string[] = [];
  const targets = parseTargets(sp, errors);
  const provider = parseProvider(sp, targets, errors);
  const appName = parseAppName(sp, errors);
  const parts = parseSignInParts(sp, targets, errors);
  if (errors.length > 0 || !targets || !parts) return { ok: false, errors };
  return {
    ok: true,
    value: {
      targets,
      targetsParam: targets.map(targetToString).join(","),
      ...parts,
      ...(appName !== undefined && { appName }),
      ...(provider !== undefined && { provider }),
    },
  };
}

/** Parse `/checkout/` query parameters (PROTOCOL §4.6). */
export function parseCheckoutParams(sp: URLSearchParams): ParseResult<CheckoutParams> {
  const errors: string[] = [];
  const targets = parseTargets(sp, errors);
  const provider = parseProvider(sp, targets, errors);
  const appName = parseAppName(sp, errors);

  let amount: number | undefined;
  const amountRaw = sp.get("amount");
  if (amountRaw !== null && amountRaw !== "") {
    const n = Number(amountRaw);
    if (!AMOUNT.test(amountRaw) || !Number.isSafeInteger(n) || n <= 0 || n > AMOUNT_MAX) {
      errors.push("The amount must be a positive whole number in minor units (e.g. 500 for 5.00).");
    } else {
      amount = n;
    }
  }

  let currency: string | undefined;
  const currencyRaw = sp.get("currency");
  if (currencyRaw !== null && currencyRaw !== "") {
    if (!CURRENCY.test(currencyRaw)) errors.push(`"${currencyRaw}" is not a currency code.`);
    else currency = currencyRaw.toUpperCase();
  }

  let frequency: Frequency | undefined;
  const frequencyRaw = sp.get("frequency");
  if (frequencyRaw !== null && frequencyRaw !== "") {
    const f = Frequency.safeParse(frequencyRaw);
    if (!f.success) errors.push(`Unknown frequency "${frequencyRaw}". Use one_time, monthly or yearly.`);
    else frequency = f.data;
  }

  const stepRaw = sp.get("step");
  let step: "choose" | undefined;
  if (stepRaw !== null && stepRaw !== "") {
    if (stepRaw !== "choose") errors.push(`Unknown step "${stepRaw}".`);
    else step = "choose";
  }

  const hasChallenge = (sp.get("challenge") ?? "") !== "";
  let signIn: SignInParams | null = null;
  let origin: string | undefined;
  if (hasChallenge && step !== "choose") {
    const parts = parseSignInParts(sp, targets, errors);
    if (parts && targets) {
      signIn = {
        targets,
        targetsParam: targets.map(targetToString).join(","),
        ...parts,
        ...(appName !== undefined && { appName }),
        ...(provider !== undefined && { provider }),
      };
      origin = parts.origin;
    }
  } else {
    // Anonymous link or post-sign-in step: origin is optional and only used for the
    // informational checkout_redirected message, so a bad value is ignored, not fatal.
    const o = sp.get("origin");
    const delivery = sp.get("delivery");
    if (o && isValidOrigin(o) && (delivery === null || delivery === "web_message")) origin = o;
  }

  if (errors.length > 0 || !targets) return { ok: false, errors };
  return {
    ok: true,
    value: {
      targets,
      targetsParam: targets.map(targetToString).join(","),
      signIn,
      ...(amount !== undefined && { amount }),
      ...(currency !== undefined && { currency }),
      ...(frequency !== undefined && { frequency }),
      ...(provider !== undefined && { provider }),
      ...(origin !== undefined && { origin }),
      ...(appName !== undefined && { appName }),
      ...(step !== undefined && { step }),
    },
  };
}

/** Who is asking (PROTOCOL §4.2). */
export function requesterOf(p: SignInParams): Requester {
  switch (p.delivery) {
    case "web_message":
      return { kind: "web", origin: p.origin ?? "" };
    case "redirect":
      return { kind: "redirect", host: p.redirectUri ? new URL(p.redirectUri).host : "" };
    case "loopback":
    case "paste":
      return { kind: "native", appName: p.appName ?? null, delivery: p.delivery };
  }
}

/**
 * The `continue` form field of `POST /api/oauth/:provider/start` from `/checkout/` (PROTOCOL §4.6 step 1):
 * the checkout query string without challenge, delivery, origin and redirect_uri.
 * Built from the validated values so nothing unexpected is carried through.
 */
export function buildContinue(p: CheckoutParams): string {
  const q = new URLSearchParams();
  q.set("targets", p.targetsParam);
  if (p.amount !== undefined) q.set("amount", String(p.amount));
  if (p.currency !== undefined) q.set("currency", p.currency);
  if (p.frequency !== undefined) q.set("frequency", p.frequency);
  if (p.provider !== undefined) q.set("provider", p.provider);
  if (p.appName !== undefined) q.set("app_name", p.appName);
  return q.toString();
}

/** A sign-in start form: `POST <action>` with these hidden fields (PROTOCOL §4.2 step 3, §4.3). */
export interface StartForm {
  /** `<API origin>/api/oauth/<provider>/start`, or root-relative when the API is same-origin. */
  action: string;
  /** Hidden fields in `OAUTH_START_FIELDS` order, only those present. */
  fields: [name: string, value: string][];
}

/**
 * The top-level form POST that starts provider OAuth (PROTOCOL §4.2 step 3): one hidden field per
 * present §4.1 parameter, plus `continue` from `/checkout/` (§4.6). Values are exactly what the
 * query parameters would have been.
 */
export function buildStartForm(apiBase: string, provider: Provider, p: SignInParams, continueValue?: string): StartForm {
  const values: Record<(typeof OAUTH_START_FIELDS)[number], string | undefined> = {
    targets: p.targetsParam,
    challenge: p.challenge,
    delivery: p.delivery,
    origin: p.origin,
    redirect_uri: p.redirectUri,
    app_name: p.appName,
    provider: p.provider,
    add: p.add ? "1" : undefined,
    continue: continueValue,
  };
  const fields: [string, string][] = [];
  for (const name of OAUTH_START_FIELDS) {
    const v = values[name];
    if (v !== undefined) fields.push([name, v]);
  }
  return { action: `${trimTrailingSlashes(apiBase)}${API_PATHS.oauthStart(provider)}`, fields };
}

/** `/api/v1/targets?github=…&opencollective=…` query for a target set (PROTOCOL §3.1). */
export function targetsQuery(targets: Target[]): string {
  const q = new URLSearchParams();
  for (const t of targets) q.set(t.provider, t.account);
  return q.toString();
}
