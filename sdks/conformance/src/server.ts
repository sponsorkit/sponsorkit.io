/**
 * The conformance fake Sponsorkit API (PROTOCOL §9).
 *
 * It implements the §3 HTTP API with deterministic data, plus non-interactive
 * versions of the browser pages (/connect, /checkout) so SDK test suites can
 * drive sign-in and checkout with a plain HTTP client. Behaviour is switched
 * through the control API under /__control (see README.md).
 */
import {
  ContributionResult,
  Delivery,
  Frequency,
  HEADERS,
  Provider,
  TokenRequest,
  normalizeTarget,
  targetToString,
  targetsFromParam,
  targetsHash,
  targetsToParam,
  type Contribution,
  type ErrorCode,
  type Identity,
  type Target,
  type TargetInfo,
} from "@sponsorkit/shared";
import { z } from "zod";
import { ControlOptions, ControlPatch, ControlRequest, MintSessionRequest, type ContributionRef, type FailEndpoint } from "./control";
import { CODE_CHALLENGE_PATTERN, pairwiseSupporterId, pkceChallenge, randomToken, timingSafeEqualString } from "./crypto";
import { eligibility, type CheckoutOptions } from "./eligibility";
import { FAKE_IDENTITIES, defaultPool, namedContribution, targetInfo } from "./fixtures";

export const CODE_TTL_SECONDS = 60;
export const PASTE_CODE_TTL_SECONDS = 600;
export const SESSION_TTL_SECONDS = 180 * 24 * 3600;

/** Request headers copied into the request log. Everything else is dropped. */
const LOGGED_HEADERS = ["authorization", "content-type", "accept", "user-agent", "origin"];

export interface RequestLogEntry {
  seq: number;
  time: string;
  requestId: string;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
  status: number;
  /** Selected response headers: Location, Retry-After, Sponsorkit-Session. */
  responseHeaders: Record<string, string>;
}

interface StoredIdentity {
  provider: Provider;
  id: string;
  handle: string;
}

interface Session {
  targets: string;
  identities: StoredIdentity[];
  iat: number;
  exp: number;
}

export interface IssuedCode {
  code: string;
  provider: Provider;
  targets: string;
  challenge: string;
  delivery: Delivery;
  redirectUri: string | null;
  origin: string | null;
  issuedAt: string;
  expiresAt: string;
  /** "connect" or "checkout": which page issued it. */
  via: "connect" | "checkout";
}

interface Counters {
  failRemaining: number | null;
  rateLimitRemaining: number | null;
  renewRemaining: number;
  newContribution: { armed: boolean; callsWithout: number };
}

type ResolvedOptions = z.infer<typeof ControlOptions>;

class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly detail: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(detail);
  }
}

const TITLES: Record<ErrorCode, string> = {
  invalid_request: "Invalid request",
  invalid_target: "Invalid target",
  invalid_code: "Invalid code",
  session_invalid: "Session invalid",
  rate_limited: "Rate limited",
  not_found: "Not found",
  internal: "Internal error",
};

const nowSeconds = () => Math.floor(Date.now() / 1000);
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function html(status: number, title: string, body: string, headers: Record<string, string> = {}): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } },
  );
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function problem(p: HttpProblem): Response {
  return new Response(
    JSON.stringify({ type: `https://sponsorkit.io/problems/${p.code}`, title: TITLES[p.code], status: p.status, code: p.code, detail: p.detail }),
    { status: p.status, headers: { "content-type": "application/problem+json", ...p.headers } },
  );
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

const LOOPBACK_REDIRECT = /^http:\/\/(?:127\.0\.0\.1|\[::1\]):(\d{1,5})\/callback$/;

function isAllowedRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

function isOrigin(s: string): boolean {
  try {
    const u = new URL(s);
    return (u.protocol === "https:" || u.protocol === "http:") && u.origin === s;
  } catch {
    return false;
  }
}

export interface FakeServerOptions {
  /** Scenario `server` blocks, keyed by scenario id. Defaults to scenarios.json next to this package. */
  scenarios?: Record<string, ControlRequest>;
}

export class FakeSponsorkit {
  private behaviour: ResolvedOptions = {};
  private scenario: string | null = null;
  private counters: Counters = FakeSponsorkit.freshCounters({});
  private sessions = new Map<string, Session>();
  private codes = new Map<string, IssuedCode>();
  private lastCode: IssuedCode | null = null;
  private issuedSessionTokens: string[] = [];
  private log: RequestLogEntry[] = [];
  private seq = 0;
  private requestCounter = 0;
  private checkoutVisits = 0;
  private contributionsCalls = 0;

  constructor(private readonly options: FakeServerOptions = {}) {}

  private static freshCounters(b: ResolvedOptions): Counters {
    return {
      failRemaining: b.fail?.times ?? null,
      rateLimitRemaining: b.rateLimit?.times ?? null,
      renewRemaining: b.renewSession?.times ?? 0,
      newContribution: { armed: b.newContribution?.trigger === "immediate", callsWithout: 0 },
    };
  }

  // ---------------------------------------------------------------- control

  /** Replace the behaviour (POST /__control). Sessions, codes and the request log are kept. */
  applyControl(input: unknown): void {
    const req = ControlRequest.parse(input);
    const { scenario, ...overrides } = req;
    let base: ControlRequest = {};
    if (scenario !== undefined) {
      const known = this.options.scenarios;
      if (!known || !(scenario in known)) throw new Error(`Unknown scenario "${scenario}"`);
      base = known[scenario] ?? {};
    }
    const { scenario: _ignored, ...baseOptions } = base;
    this.setBehaviour(ControlOptions.parse({ ...baseOptions, ...overrides }), scenario ?? null);
  }

  /** Merge into the current behaviour (PATCH /__control). Counters of the keys given are reset. */
  patchControl(input: unknown): void {
    const patch = ControlPatch.parse(input);
    const next: Record<string, unknown> = { ...this.behaviour };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete next[k];
      else if (v !== undefined) next[k] = v;
    }
    const merged = ControlOptions.parse(next);
    this.validateRefs(merged);
    const fresh = FakeSponsorkit.freshCounters(merged);
    if ("fail" in patch) this.counters.failRemaining = fresh.failRemaining;
    if ("rateLimit" in patch) this.counters.rateLimitRemaining = fresh.rateLimitRemaining;
    if ("renewSession" in patch) this.counters.renewRemaining = fresh.renewRemaining;
    if ("newContribution" in patch) this.counters.newContribution = fresh.newContribution;
    this.behaviour = merged;
  }

  private setBehaviour(b: ResolvedOptions, scenario: string | null): void {
    this.validateRefs(b);
    this.behaviour = b;
    this.scenario = scenario;
    this.counters = FakeSponsorkit.freshCounters(b);
  }

  /** Contribution fixture names must exist (fail at control time, not at request time). */
  private validateRefs(b: ResolvedOptions): void {
    for (const ref of b.contributions ?? []) this.resolveContribution(ref);
    if (b.newContribution) this.resolveContribution(b.newContribution.contribution);
  }

  /** POST /__control/reset: back to a freshly started server. */
  reset(): void {
    this.setBehaviour({}, null);
    this.sessions.clear();
    this.codes.clear();
    this.lastCode = null;
    this.issuedSessionTokens = [];
    this.log = [];
    this.checkoutVisits = 0;
    this.contributionsCalls = 0;
  }

  state() {
    return {
      scenario: this.scenario,
      behaviour: this.behaviour,
      counters: this.counters,
      lastSessionToken: this.issuedSessionTokens.at(-1) ?? null,
      issuedSessionTokens: this.issuedSessionTokens,
      lastCode: this.lastCode?.code ?? null,
      sessions: this.sessions.size,
      checkoutVisits: this.checkoutVisits,
      contributionsCalls: this.contributionsCalls,
      lastRequestSeq: this.seq,
    };
  }

  requests(since = 0): RequestLogEntry[] {
    return this.log.filter((e) => e.seq > since);
  }

  async mintSession(input: unknown): Promise<{ sessionToken: string; expiresAt: string }> {
    const req = MintSessionRequest.parse(input);
    const targets = targetsToParam(targetsFromParam(req.targets));
    const providers = new Set(targetsFromParam(targets).map((t) => t.provider));
    for (const p of req.identities)
      if (!providers.has(p)) throw new Error(`Identity provider ${p} is not in the target set ${targets}`);
    const identities = [...new Set(req.identities)].map((p) => ({ ...FAKE_IDENTITIES[p] }));
    return this.issueSession(targets, identities);
  }

  // ---------------------------------------------------------------- HTTP

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/__control" || url.pathname.startsWith("/__control/")) {
      return this.withCors(await this.handleControl(request, url));
    }

    const requestId = `req_${String(++this.requestCounter).padStart(6, "0")}`;
    const bodyText = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
    const entry: RequestLogEntry = {
      seq: ++this.seq,
      time: new Date().toISOString(),
      requestId,
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(
        [...request.headers].filter(([k]) => LOGGED_HEADERS.includes(k) || k.startsWith("sponsorkit-")),
      ),
      status: 0,
      responseHeaders: {},
    };
    if (bodyText) {
      try {
        entry.body = JSON.parse(bodyText);
      } catch {
        entry.body = bodyText.slice(0, 4096);
      }
    }
    this.log.push(entry);

    let response: Response;
    try {
      response = await this.route(request.method, url, bodyText, request.headers.get("authorization"));
    } catch (e) {
      response = e instanceof HttpProblem ? problem(e) : problem(new HttpProblem(500, "internal", String(e)));
    }
    response = this.withCors(response);
    response.headers.set(HEADERS.requestId, requestId);
    entry.status = response.status;
    for (const h of ["location", "retry-after", HEADERS.renewedSession.toLowerCase()]) {
      const v = response.headers.get(h);
      if (v !== null) entry.responseHeaders[h] = v;
    }
    return response;
  }

  private withCors(r: Response): Response {
    r.headers.set("access-control-allow-origin", "*");
    r.headers.set("access-control-allow-headers", "Authorization, Content-Type");
    r.headers.set("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
    r.headers.set("access-control-expose-headers", `${HEADERS.renewedSession}, ${HEADERS.requestId}, Retry-After`);
    return r;
  }

  private async handleControl(request: Request, url: URL): Promise<Response> {
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const body = async () => {
      const text = await request.text();
      return text ? JSON.parse(text) : {};
    };
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204 });
      if (path === "/__control") {
        if (request.method === "GET") return json(this.state());
        if (request.method === "POST") {
          this.applyControl(await body());
          return json(this.state());
        }
        if (request.method === "PATCH") {
          this.patchControl(await body());
          return json(this.state());
        }
      }
      if (path === "/__control/reset" && request.method === "POST") {
        this.reset();
        return json(this.state());
      }
      if (path === "/__control/requests") {
        if (request.method === "GET") {
          const since = Number(url.searchParams.get("since") ?? "0");
          return json({ requests: this.requests(Number.isFinite(since) ? since : 0), lastSeq: this.seq });
        }
        if (request.method === "DELETE") {
          this.log = [];
          return json({ requests: [], lastSeq: this.seq });
        }
      }
      if (path === "/__control/codes/latest" && request.method === "GET") {
        return this.lastCode ? json(this.lastCode) : json({ error: "no code issued yet" }, 404);
      }
      if (path === "/__control/codes" && request.method === "GET") {
        return json({ codes: [...this.codes.values()] });
      }
      if (path === "/__control/sessions" && request.method === "POST") {
        return json(await this.mintSession(await body()));
      }
      if (path === "/__control/unreachable" && request.method === "GET") {
        return json({ baseUrl: await unreachableBaseUrl() });
      }
      return json({ error: `No control endpoint ${request.method} ${path}` }, 404);
    } catch (e) {
      const message = e instanceof z.ZodError ? z.prettifyError(e) : e instanceof Error ? e.message : String(e);
      return json({ error: message }, 400);
    }
  }

  private async route(method: string, url: URL, bodyText: string, authorization: string | null): Promise<Response> {
    const path = url.pathname;
    if (method === "OPTIONS") return new Response(null, { status: 204 });

    if (path.startsWith("/api/")) {
      if (this.behaviour.latencyMs) await Bun.sleep(this.behaviour.latencyMs);
      if (method === "GET" && path === "/api/v1/targets") return this.targets(url);
      if (method === "POST" && path === "/api/v1/auth/token") return this.token(bodyText);
      if (method === "GET" && path === "/api/v1/contributions") return this.contributions(authorization);
      if (method === "GET" && path === "/api/v1/health") return this.health();
      throw new HttpProblem(404, "not_found", `No route ${method} ${path}`);
    }

    if (method !== "GET") return html(405, "Method not allowed", "");
    if (path === "/connect") return this.connect(url, "connect");
    if (path === "/checkout") return this.checkout(url);
    if (path === "/connect/done") return html(200, "Sponsorkit", "<p>You can close this window.</p>");
    if (path === "/checkout/thanks") return html(200, "Thank you", "<p>Thanks for your contribution.</p>");
    const fake = /^\/__fake\/provider\/([a-z]+)$/.exec(path);
    if (fake) return this.fakeProviderPage(fake[1]!, url);
    return html(404, "Not found", "");
  }

  // ---------------------------------------------------------------- API

  private consumeFail(endpoint: FailEndpoint): void {
    const f = this.behaviour.fail;
    if (!f || !f.endpoints.includes(endpoint)) return;
    if (this.counters.failRemaining !== null) {
      if (this.counters.failRemaining <= 0) return;
      this.counters.failRemaining--;
    }
    throw new HttpProblem(f.status, "internal", `Simulated ${f.status} (conformance scenario)`);
  }

  private targets(url: URL): Response {
    this.consumeFail("targets");
    const out: Target[] = [];
    for (const [key, value] of url.searchParams) {
      if (key !== "github" && key !== "opencollective") continue;
      try {
        out.push(normalizeTarget(key, value));
      } catch (e) {
        throw new HttpProblem(400, "invalid_target", e instanceof Error ? e.message : String(e));
      }
    }
    if (out.length === 0) throw new HttpProblem(400, "invalid_target", "At least one of github= or opencollective= is required");
    let canonical: Target[];
    try {
      canonical = targetsFromParam(out.map(targetToString).join(","));
    } catch (e) {
      throw new HttpProblem(400, "invalid_target", e instanceof Error ? e.message : String(e));
    }
    const targets: TargetInfo[] = canonical.map((t) => targetInfo(t.provider, t.account));
    return json({ targets }, 200, { "cache-control": "public, max-age=3600" });
  }

  private health(): Response {
    this.consumeFail("health");
    const outage = new Set(this.behaviour.outage ?? []);
    return json({
      ok: true,
      providers: {
        github: outage.has("github") ? "degraded" : "ok",
        opencollective: outage.has("opencollective") ? "degraded" : "ok",
      },
    });
  }

  private async token(bodyText: string): Promise<Response> {
    this.consumeFail("token");
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      throw new HttpProblem(400, "invalid_request", "Body must be JSON");
    }
    const parsed = TokenRequest.safeParse(parsedBody);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.path.join("."));
      // A malformed verifier is a failed PKCE check, not a malformed request.
      if (issues.length > 0 && issues.every((p) => p === "code" || p === "codeVerifier"))
        throw new HttpProblem(400, "invalid_code", "The code or code verifier is malformed");
      throw new HttpProblem(400, "invalid_request", z.prettifyError(parsed.error));
    }
    const { code, codeVerifier, sessionToken } = parsed.data;
    if (this.behaviour.rejectCodes) throw new HttpProblem(400, "invalid_code", "Code rejected (conformance scenario)");

    const record = this.codes.get(code);
    if (!record) throw new HttpProblem(400, "invalid_code", "Unknown, malformed or tampered code");
    if (Date.parse(record.expiresAt) <= Date.now()) throw new HttpProblem(400, "invalid_code", "The code has expired");
    if (!timingSafeEqualString(await pkceChallenge(codeVerifier), record.challenge))
      throw new HttpProblem(400, "invalid_code", "The code verifier does not match the code challenge");

    const identity: StoredIdentity = { ...FAKE_IDENTITIES[record.provider] };
    let identities: StoredIdentity[] = [identity];
    if (sessionToken !== undefined) {
      const existing = this.openSession(sessionToken);
      if (existing.targets !== record.targets)
        throw new HttpProblem(400, "invalid_request", "The session and the code are bound to different target sets");
      const replaced = existing.identities.map((i) => (i.provider === identity.provider ? identity : i));
      identities = replaced.some((i) => i.provider === identity.provider) ? replaced : [...replaced, identity];
    }
    const issued = await this.issueSession(record.targets, identities);
    const session = this.sessions.get(issued.sessionToken)!;
    const result = await this.buildResult(session, false);
    return json({ sessionToken: issued.sessionToken, expiresAt: issued.expiresAt, result });
  }

  private async issueSession(targets: string, identities: StoredIdentity[]): Promise<{ sessionToken: string; expiresAt: string }> {
    const iat = nowSeconds();
    const session: Session = { targets, identities, iat, exp: iat + SESSION_TTL_SECONDS };
    const token = randomToken("sks_");
    this.sessions.set(token, session);
    this.issuedSessionTokens.push(token);
    return { sessionToken: token, expiresAt: iso(session.exp) };
  }

  private openSession(token: string): Session {
    if (this.behaviour.sessionInvalid) throw new HttpProblem(401, "session_invalid", "The session is no longer valid");
    const session = this.sessions.get(token);
    if (!session || session.exp <= nowSeconds()) throw new HttpProblem(401, "session_invalid", "Unknown, malformed or expired session token");
    return session;
  }

  private async contributions(authorization: string | null): Promise<Response> {
    this.consumeFail("contributions");
    const auth = /^Bearer (\S+)$/.exec(authorization ?? "");
    if (!auth) throw new HttpProblem(401, "session_invalid", "Missing or malformed Authorization header");
    const session = this.openSession(auth[1]!);

    const rl = this.behaviour.rateLimit;
    if (rl && (this.counters.rateLimitRemaining === null || this.counters.rateLimitRemaining > 0)) {
      if (this.counters.rateLimitRemaining !== null) this.counters.rateLimitRemaining--;
      throw new HttpProblem(429, "rate_limited", "At most one refresh per 60 s per session", {
        "retry-after": String(rl.retryAfter),
      });
    }

    this.contributionsCalls++;
    const result = await this.buildResult(session, true);
    const headers: Record<string, string> = {};
    if (this.counters.renewRemaining > 0) {
      this.counters.renewRemaining--;
      headers[HEADERS.renewedSession] = (await this.issueSession(session.targets, session.identities)).sessionToken;
    }
    return json(result, 200, headers);
  }

  private resolveContribution(ref: ContributionRef): Contribution {
    return typeof ref === "string" ? namedContribution(ref) : structuredClone(ref);
  }

  private async buildResult(session: Session, live: boolean): Promise<ContributionResult> {
    const pool = this.behaviour.contributions ? this.behaviour.contributions.map((r) => this.resolveContribution(r)) : defaultPool();

    const nc = this.behaviour.newContribution;
    if (live && nc && this.counters.newContribution.armed) {
      if (this.counters.newContribution.callsWithout >= nc.afterCalls) {
        const added = this.resolveContribution(nc.contribution);
        const i = pool.findIndex((c) => c.id === added.id);
        if (i >= 0) pool[i] = added;
        else pool.push(added);
      } else {
        this.counters.newContribution.callsWithout++;
      }
    }

    const targetSet = new Set(session.targets.split(","));
    const idProviders = new Set(session.identities.map((i) => i.provider));
    const outage = new Set(this.behaviour.outage ?? []);
    const reconnect = new Set(this.behaviour.needsReconnect ?? []);
    const unavailable = Provider.options.filter((p) => idProviders.has(p) && outage.has(p));
    const first = session.identities[0]!;
    const identities: Identity[] = session.identities.map((i) => ({ ...i, needsReconnect: reconnect.has(i.provider) }));
    const hash = await targetsHash(targetsFromParam(session.targets));

    return ContributionResult.parse({
      signedIn: true,
      disabled: false,
      mock: false,
      targets: session.targets.split(","),
      supporter: { id: await pairwiseSupporterId(hash, first.provider, first.id), identities },
      contributions: pool.filter((c) => targetSet.has(c.target) && idProviders.has(c.provider) && !outage.has(c.provider)),
      fetchedAt: new Date().toISOString(),
      stale: unavailable.length > 0,
      fromCache: false,
      ...(unavailable.length > 0 ? { unavailable } : {}),
    });
  }

  // ---------------------------------------------------------------- pages

  /** Validates the §4.1 sign-in params. Returns an HTML error response when invalid. */
  private signInParams(url: URL): { ok: true; targets: string; provider: Provider; challenge: string; delivery: Delivery; redirectUri: string | null; origin: string | null } | { ok: false; response: Response } {
    const q = url.searchParams;
    const fail = (msg: string) => ({ ok: false as const, response: html(400, "Invalid request", `<p>${escapeHtml(msg)}</p>`) });
    const targetsParam = q.get("targets");
    if (!targetsParam) return fail("targets is required");
    let canonical: string;
    try {
      canonical = targetsToParam(targetsFromParam(targetsParam));
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    if (canonical !== targetsParam) return fail(`targets must be canonical: expected "${canonical}"`);
    const challenge = q.get("challenge") ?? "";
    if (!CODE_CHALLENGE_PATTERN.test(challenge)) return fail("challenge must be a 43-character base64url S256 challenge");
    const delivery = Delivery.safeParse(q.get("delivery"));
    if (!delivery.success) return fail("delivery must be web_message, redirect, loopback or paste");
    const redirectUri = q.get("redirect_uri");
    const origin = q.get("origin");
    if (delivery.data === "loopback" && !(redirectUri && LOOPBACK_REDIRECT.test(redirectUri)))
      return fail("loopback redirect_uri must be http://127.0.0.1:<port>/callback or http://[::1]:<port>/callback");
    if (delivery.data === "redirect" && !(redirectUri && isAllowedRedirectUri(redirectUri)))
      return fail("redirect_uri must be https or http://localhost / http://127.0.0.1");
    if (delivery.data === "web_message" && !(origin && isOrigin(origin))) return fail("origin must be an origin");
    const appName = q.get("app_name");
    if (appName !== null && (appName.length === 0 || appName.length > 64)) return fail("app_name must be 1-64 characters");
    const add = q.get("add");
    if (add !== null && add !== "1") return fail("add must be 1");
    const providers = targetsFromParam(canonical).map((t) => t.provider);
    const requested = q.get("provider");
    if (requested !== null && !providers.includes(requested as Provider)) return fail("provider must be in the target set");
    const configured = this.behaviour.connect?.provider;
    const provider = (requested as Provider | null) ?? (configured && providers.includes(configured) ? configured : providers[0]!);
    return { ok: true, targets: canonical, provider, challenge, delivery: delivery.data, redirectUri, origin };
  }

  /** Non-interactive /connect (and the sign-in half of /checkout): issue a code and deliver it. */
  private connect(url: URL, via: "connect" | "checkout", continueQuery?: string): Response {
    const p = this.signInParams(url);
    if (!p.ok) return p.response;
    if (this.behaviour.connect?.abandon)
      return html(200, "Sign in to Sponsorkit", "<p>Waiting for the provider. (Conformance: this sign-in is never completed.)</p>");
    const error = this.behaviour.connect?.error;
    if (error) return this.deliver(p, { error }, continueQuery);
    const ttl = p.delivery === "paste" ? PASTE_CODE_TTL_SECONDS : CODE_TTL_SECONDS;
    const now = nowSeconds();
    const record: IssuedCode = {
      code: randomToken("skc_"),
      provider: p.provider,
      targets: p.targets,
      challenge: p.challenge,
      delivery: p.delivery,
      redirectUri: p.redirectUri,
      origin: p.origin,
      issuedAt: iso(now),
      expiresAt: iso(now + ttl),
      via,
    };
    this.codes.set(record.code, record);
    this.lastCode = record;
    return this.deliver(p, { code: record.code }, continueQuery);
  }

  private deliver(
    p: { delivery: Delivery; redirectUri: string | null; origin: string | null },
    what: { code: string } | { error: string },
    continueQuery?: string,
  ): Response {
    const isCode = "code" in what;
    const value = isCode ? what.code : what.error;
    const cont = continueQuery ? `&continue=${encodeURIComponent(continueQuery)}` : "";
    switch (p.delivery) {
      case "loopback": {
        const u = new URL(p.redirectUri!);
        u.searchParams.set(isCode ? "code" : "error", value);
        return redirect(u.toString());
      }
      case "redirect": {
        const u = new URL(p.redirectUri!);
        u.searchParams.append(isCode ? "sponsorkit_code" : "sponsorkit_error", value);
        return redirect(u.toString());
      }
      case "web_message":
        return redirect(`/connect/done#${isCode ? "code" : "error"}=${encodeURIComponent(value)}&origin=${encodeURIComponent(p.origin!)}${isCode ? cont : ""}`);
      case "paste": {
        const headers: Record<string, string> = { "content-type": "text/plain; charset=utf-8" };
        if (isCode) headers["sponsorkit-conformance-code"] = value;
        if (isCode && continueQuery) headers["sponsorkit-conformance-continue"] = `/checkout?${continueQuery}&step=choose`;
        return new Response(isCode ? `${value}\n` : `error: ${value}\n`, { status: isCode ? 200 : 400, headers });
      }
    }
  }

  private checkout(url: URL): Response {
    const q = url.searchParams;
    const bad = (msg: string) => html(400, "Invalid checkout link", `<p>${escapeHtml(msg)}</p>`);
    const targetsParam = q.get("targets");
    if (!targetsParam) return bad("targets is required");
    let targets: Target[];
    try {
      targets = targetsFromParam(targetsParam);
    } catch (e) {
      return bad(e instanceof Error ? e.message : String(e));
    }
    if (targetsToParam(targets) !== targetsParam) return bad(`targets must be canonical: expected "${targetsToParam(targets)}"`);

    const opts: CheckoutOptions = {};
    const amount = q.get("amount");
    if (amount !== null) {
      if (!/^[1-9]\d*$/.test(amount)) return bad("amount must be a positive integer in minor units");
      opts.amount = Number(amount);
    }
    const currency = q.get("currency");
    if (currency !== null) {
      if (!/^[A-Z]{3}$/.test(currency)) return bad("currency must be an uppercase ISO 4217 code");
      opts.currency = currency;
    }
    const frequency = q.get("frequency");
    if (frequency !== null) {
      const f = Frequency.safeParse(frequency);
      if (!f.success) return bad("frequency must be one_time, monthly or yearly");
      opts.frequency = f.data;
    }
    const requested = q.get("provider");
    if (requested !== null && !targets.some((t) => t.provider === requested)) return bad("provider must be in the target set");
    const step = q.get("step");
    if (step !== null && step !== "choose") return bad("step must be choose");

    // Step 1: sign in first when a challenge is present.
    if (q.has("challenge") && step !== "choose") {
      const cont = new URLSearchParams(q);
      for (const k of ["challenge", "delivery", "origin", "redirect_uri"]) cont.delete(k);
      return this.connect(url, "checkout", cont.toString());
    }

    // Step 2: choose a provider (PROTOCOL §6).
    const origin = url.origin;
    const results = targets.map((t) => eligibility(targetInfo(t.provider, t.account), opts, origin));
    const eligible = results.filter((r) => r.eligible);
    let pick: (typeof eligible)[number] | undefined;
    if (requested !== null) pick = eligible.find((r) => r.provider === requested);
    else if (eligible.length === 1) pick = eligible[0];
    else if (eligible.length > 1 && this.behaviour.checkoutChoice) pick = eligible.find((r) => r.provider === this.behaviour.checkoutChoice);

    if (pick && pick.eligible) return redirect(`/__fake/provider/${pick.provider}?to=${encodeURIComponent(pick.url)}`);
    const items = results
      .map((r) =>
        r.eligible
          ? `<li><a href="/__fake/provider/${r.provider}?to=${encodeURIComponent(r.url)}">${r.provider}</a></li>`
          : `<li>${r.provider}: ${escapeHtml(r.reason)}</li>`,
      )
      .join("");
    return html(200, eligible.length === 0 ? "No provider can take this contribution" : "Choose a provider", `<ul>${items}</ul>`);
  }

  private fakeProviderPage(provider: string, url: URL): Response {
    if (!Provider.safeParse(provider).success) return html(404, "Not found", "");
    this.checkoutVisits++;
    if (this.behaviour.newContribution?.trigger === "checkout") this.counters.newContribution.armed = true;
    const to = url.searchParams.get("to") ?? "";
    return html(200, `Fake ${provider} checkout`, `<p>The real checkout would be <code>${escapeHtml(to)}</code>.</p>`);
  }
}

/** A base URL whose port refuses connections (bound and released). */
export async function unreachableBaseUrl(): Promise<string> {
  const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(null) });
  const port = s.port;
  await s.stop(true);
  return `http://127.0.0.1:${port}`;
}

export async function loadScenarioServerBlocks(path = new URL("../scenarios.json", import.meta.url)): Promise<Record<string, ControlRequest>> {
  const file = Bun.file(path);
  if (!(await file.exists())) return {};
  const data = (await file.json()) as { scenarios?: { id: string; server?: unknown }[] };
  const out: Record<string, ControlRequest> = {};
  for (const s of data.scenarios ?? []) out[s.id] = ControlRequest.parse(s.server ?? {});
  return out;
}

export interface RunningServer {
  port: number;
  baseUrl: string;
  fake: FakeSponsorkit;
  stop(): Promise<void>;
}

export async function startServer(opts: { port?: number; hostname?: string; scenarios?: Record<string, ControlRequest> } = {}): Promise<RunningServer> {
  const fake = new FakeSponsorkit({ scenarios: opts.scenarios ?? (await loadScenarioServerBlocks()) });
  const server = Bun.serve({
    port: opts.port ?? 0,
    hostname: opts.hostname ?? "127.0.0.1",
    idleTimeout: 120,
    fetch: (req) => fake.fetch(req),
  });
  const port = server.port!;
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    fake,
    stop: () => server.stop(true),
  };
}
