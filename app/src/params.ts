/** Validation of the browser-flow query parameters (PROTOCOL §4.1). */
import { Delivery, InvalidTargetError, Provider, targetsFromParam, targetsToParam, type Target } from "@sponsorkit/shared";
import { z } from "zod";
import { isValidChallenge } from "./pkce";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** `http://127.0.0.1:<port>/callback` or `http://[::1]:<port>/callback`, exactly. */
const LOOPBACK_RE = /^http:\/\/(127\.0\.0\.1|\[::1\]):([0-9]{1,5})\/callback$/;

export function isValidLoopbackRedirect(uri: string): boolean {
  const m = LOOPBACK_RE.exec(uri);
  if (!m) return false;
  const port = Number(m[2]);
  return port >= 1 && port <= 65535 && String(port) === m[2];
}

/**
 * `redirect` delivery: an https URL, or http://localhost[:port] / http://127.0.0.1[:port].
 * No credentials or fragment allowed.
 */
export function isValidRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.username || u.password || u.hash || uri.includes("#")) return false;
  if (u.protocol === "https:") return u.hostname.length > 0;
  if (u.protocol === "http:") return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  return false;
}

/**
 * `web_message` origin: a bare origin (`scheme://host[:port]`), https anywhere or http on
 * a loopback host (local development).
 */
export function isValidOrigin(origin: string): boolean {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.origin !== origin) return false; // rejects paths, trailing slashes, credentials, uppercase etc.
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && LOOPBACK_HOSTS.has(u.hostname);
}

const APP_NAME_RE = /^[^\p{Cc}\p{Cf}]{1,64}$/u;

export interface FlowParams {
  targets: Target[];
  targetParam: string;
  challenge: string;
  delivery: Delivery;
  origin?: string;
  redirectUri?: string;
  appName?: string;
  continueValue?: string;
}

export class ParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParamError";
  }
}

const RawParams = z.object({
  targets: z.string().min(1, "targets is required"),
  challenge: z.string().refine(isValidChallenge, "challenge must be a base64url S256 code challenge (43 chars)"),
  delivery: Delivery,
  origin: z.string().optional(),
  redirect_uri: z.string().max(2048).optional(),
  app_name: z.string().optional(),
  provider: Provider.optional(),
  continue: z.string().max(2048).optional(),
});

/**
 * Validate `/api/oauth/:provider/start` query params. `routeProvider` must be in the target set.
 * Parameters irrelevant to the chosen delivery are ignored (not sealed).
 */
export function parseStartParams(query: URLSearchParams, routeProvider: Provider): FlowParams {
  const raw: Record<string, string> = {};
  for (const key of ["targets", "challenge", "delivery", "origin", "redirect_uri", "app_name", "provider", "continue"]) {
    const v = query.get(key);
    if (v !== null) raw[key] = v;
  }
  const parsed = RawParams.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ParamError(issue ? `${issue.path.join(".") || "params"}: ${issue.message}` : "invalid parameters");
  }
  const p = parsed.data;

  let targets: Target[];
  try {
    targets = targetsFromParam(p.targets);
  } catch (e) {
    throw new ParamError(e instanceof InvalidTargetError ? e.message : "invalid targets");
  }
  if (!targets.some((t) => t.provider === routeProvider)) throw new ParamError(`${routeProvider} is not in the target set`);
  if (p.provider && p.provider !== routeProvider) throw new ParamError("provider does not match the route");

  const out: FlowParams = { targets, targetParam: targetsToParam(targets), challenge: p.challenge, delivery: p.delivery };

  switch (p.delivery) {
    case "web_message":
      if (!p.origin || !isValidOrigin(p.origin)) throw new ParamError("origin must be an https origin (or http on localhost)");
      out.origin = p.origin;
      break;
    case "redirect":
      if (!p.redirect_uri || !isValidRedirectUri(p.redirect_uri)) {
        throw new ParamError("redirect_uri must be an https URL or http://localhost / http://127.0.0.1");
      }
      out.redirectUri = p.redirect_uri;
      break;
    case "loopback":
      if (!p.redirect_uri || !isValidLoopbackRedirect(p.redirect_uri)) {
        throw new ParamError("redirect_uri must be http://127.0.0.1:<port>/callback or http://[::1]:<port>/callback");
      }
      out.redirectUri = p.redirect_uri;
      break;
    case "paste":
      break;
  }

  if (p.app_name !== undefined && p.app_name !== "") {
    if (!APP_NAME_RE.test(p.app_name)) throw new ParamError("app_name must be 1-64 printable characters");
    out.appName = p.app_name;
  }
  if (p.continue !== undefined && p.continue !== "") {
    // `continue` is a checkout query string appended to our own /checkout URL.
    if (/[#\s]/.test(p.continue) || p.continue.startsWith("?")) throw new ParamError("continue must be a query string");
    out.continueValue = p.continue;
  }
  return out;
}
