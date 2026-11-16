/** `/api/v1/*` (PROTOCOL §3). */
import {
  HEADERS,
  InvalidTargetError,
  TokenRequest,
  targetsFromOptions,
  targetsToParam,
  type TargetsResponse,
  type TokenResponse,
} from "@sponsorkit/shared";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { buildResult } from "../contributions";
import { hex, sha256 } from "../encoding";
import { ApiError } from "../errors";
import type { AppEnv } from "../hono";
import { describeError, logEvent } from "../log";
import { CodePayload, RENEW_AFTER, SESSION_TTL, SessionPayload, type SealedIdentity } from "../payloads";
import { verifyChallenge } from "../pkce";
import { getAdapter, ProviderError } from "../providers";
import { clientIp, enforce } from "../ratelimit";
import { loadSealingKeys, nowSeconds, seal, SealError, unseal, type SealingKey } from "../seal";

export const api = new Hono<AppEnv>();

// Per-IP limits for the whole API; stricter per-IP limit for auth.
api.use("*", async (c, next) => {
  if (c.req.method !== "OPTIONS") {
    const ip = clientIp(c.req.raw);
    await enforce(c.env.RL_IP, `ip:${ip}`);
    if (c.req.path.startsWith("/api/v1/auth/")) await enforce(c.env.RL_AUTH, `auth:${ip}`);
  }
  await next();
});

// ---------- GET /targets ----------

const TargetsQuery = z.object({
  github: z.string().max(100).optional(),
  opencollective: z.string().max(300).optional(),
});

const TARGETS_MAX_AGE = 3600;

api.get("/targets", async (c) => {
  const q = TargetsQuery.safeParse({ github: c.req.query("github"), opencollective: c.req.query("opencollective") });
  if (!q.success) throw new ApiError(400, "invalid_target", "Malformed target parameter");
  let targets;
  try {
    targets = targetsFromOptions({ github: q.data.github ?? null, opencollective: q.data.opencollective ?? null });
  } catch (e) {
    if (e instanceof InvalidTargetError) throw new ApiError(400, "invalid_target", e.message);
    throw e;
  }

  const cache = defaultCache();
  const cacheKey = new Request(`${new URL(c.req.url).origin}/api/v1/targets?t=${encodeURIComponent(targetsToParam(targets))}`);
  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => undefined);
    if (hit) return new Response(hit.body, hit);
  }

  // Every miss costs upstream calls on shared credentials (GitHub: the single metadata token's
  // GraphQL budget), and distinct targets always miss, so misses get their own, lower limits.
  const ip = clientIp(c.req.raw);
  await enforce(c.env.RL_TARGETS_MISS, `targets-miss:${ip}`);
  await enforce(c.env.RL_TARGETS_MISS_GLOBAL, "targets-miss");

  let infos;
  try {
    infos = await Promise.all(targets.map((t) => getAdapter(c.env, t.provider).fetchTargetInfo(t)));
  } catch (e) {
    if (e instanceof ProviderError) {
      logEvent("warn", { msg: "target_info_failed", provider: e.provider, error: describeError(e) });
      throw new ApiError(502, "internal", `Could not reach ${e.provider}`);
    }
    throw e;
  }
  const body: TargetsResponse = { targets: infos };
  const res = new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${TARGETS_MAX_AGE}` },
  });
  if (cache) waitUntil(c, cache.put(cacheKey, res.clone()).catch(() => undefined));
  return res;
});

// ---------- POST /auth/token ----------

api.post("/auth/token", async (c) => {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new ApiError(400, "invalid_request", "Body must be JSON");
  }
  const parsed = TokenRequest.safeParse(json);
  if (!parsed.success) throw new ApiError(400, "invalid_request", "Expected { code, codeVerifier, sessionToken? }");
  const { code, codeVerifier, sessionToken } = parsed.data;

  const keys = await loadSealingKeys(c.env.SEALING_KEYS);
  const now = nowSeconds();

  let payload: CodePayload;
  try {
    payload = await unseal("code", code, keys, CodePayload, { now });
  } catch (e) {
    if (e instanceof SealError) throw new ApiError(400, "invalid_code", "The sign-in code is invalid or expired");
    throw e;
  }
  if (!(await verifyChallenge(codeVerifier, payload.c))) {
    throw new ApiError(400, "invalid_code", "The code verifier does not match");
  }

  let ids: SealedIdentity[] = [payload.i];
  if (sessionToken !== undefined) {
    const existing = await openSession(sessionToken, keys, now);
    if (existing.t !== payload.t) throw new ApiError(400, "invalid_request", "The session has a different target set");
    // Same provider is replaced in place; a new provider is appended (the first identity stays first).
    let replaced = false;
    ids = existing.ids.map((i) => {
      if (i.p !== payload.i.p) return i;
      replaced = true;
      return payload.i;
    });
    if (!replaced) ids.push(payload.i);
  }

  const session: SessionPayload = { v: 1, t: payload.t, ids, iat: now, x: now + SESSION_TTL };
  const newToken = await seal("session", session, keys);
  const result = await buildResult(c.env, session, now);
  const body: TokenResponse = { sessionToken: newToken, expiresAt: new Date(session.x * 1000).toISOString(), result };
  return c.json(body, 200, { "Cache-Control": "no-store" });
});

// ---------- GET /contributions ----------

api.get("/contributions", async (c) => {
  const auth = c.req.header("Authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (!m) throw new ApiError(401, "session_invalid", "Missing bearer session token");
  await enforce(c.env.RL_CONTRIB_IP, `contrib:${clientIp(c.req.raw)}`);
  const keys = await loadSealingKeys(c.env.SEALING_KEYS);
  const now = nowSeconds();
  const session = await openSession(m[1]!, keys, now);

  // One refresh per minute per session. Keyed on the target set + identities, so a renewed
  // token (fresh iat) doesn't reset the window.
  const sessionKey = hex(await sha256(`${session.t}|${session.ids.map((i) => `${i.p}:${i.id}`).join(",")}`));
  await enforce(c.env.RL_REFRESH, `session:${sessionKey}`);

  const result = await buildResult(c.env, session, now);
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (now - session.iat > RENEW_AFTER) {
    const renewed: SessionPayload = { ...session, iat: now, x: now + SESSION_TTL };
    headers[HEADERS.renewedSession] = await seal("session", renewed, keys);
  }
  return c.json(result, 200, headers);
});

// ---------- GET /health ----------

let healthCache: { at: number; value: { github: "ok" | "degraded"; opencollective: "ok" | "degraded" } } | null = null;
const HEALTH_TTL_MS = 30_000;

/** Test hook. */
export function resetHealthCache(): void {
  healthCache = null;
}

api.get("/health", async (c) => {
  if (!healthCache || Date.now() - healthCache.at > HEALTH_TTL_MS) {
    const [gh, oc] = await Promise.all([getAdapter(c.env, "github").ping(), getAdapter(c.env, "opencollective").ping()]);
    healthCache = { at: Date.now(), value: { github: gh ? "ok" : "degraded", opencollective: oc ? "ok" : "degraded" } };
  }
  return c.json({ ok: true, providers: healthCache.value }, 200, { "Cache-Control": "no-store" });
});

// ---------- helpers ----------

async function openSession(token: string, keys: SealingKey[], now: number): Promise<SessionPayload> {
  try {
    return await unseal("session", token, keys, SessionPayload, { now });
  } catch (e) {
    if (e instanceof SealError) throw new ApiError(401, "session_invalid", "The session token is invalid or expired");
    throw e;
  }
}

interface CacheLike {
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
}

function defaultCache(): CacheLike | null {
  const caches = (globalThis as { caches?: { default?: CacheLike } }).caches;
  return caches?.default ?? null;
}

function waitUntil(c: Context<AppEnv>, p: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    // No execution context (tests / non-Workers runtimes): let it run detached.
    void p;
  }
}
