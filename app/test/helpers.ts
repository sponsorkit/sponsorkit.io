import { vi } from "vitest";
import { createApp } from "../src/app";
import { base64urlEncode } from "../src/encoding";
import type { Env, RateLimitBinding } from "../src/env";
import { challengeFor } from "../src/pkce";
import { GH_VIEWER, OC_ME, ghContributions, ghTarget, ocContributions, ocTarget } from "./fixtures";

export const ORIGIN = "https://sponsorkit.test";

export function keyB64(fill: number): string {
  return base64urlEncode(new Uint8Array(32).fill(fill));
}

export const KEYS_V1 = JSON.stringify([{ id: 1, key: keyB64(1) }]);
export const KEYS_V2 = JSON.stringify([
  { id: 2, key: keyB64(2) },
  { id: 1, key: keyB64(1) },
]);

export function makeEnv(over: Partial<Env> = {}): Env {
  return {
    GITHUB_CLIENT_ID: "gh-client",
    GITHUB_CLIENT_SECRET: "gh-secret",
    OPENCOLLECTIVE_CLIENT_ID: "oc-client",
    OPENCOLLECTIVE_CLIENT_SECRET: "oc-secret",
    SEALING_KEYS: KEYS_V1,
    PAIRWISE_KEY: "pairwise-test-key",
    GITHUB_METADATA_TOKEN: "ghp_metadata",
    GITHUB_OAUTH_BASE: "https://github.test",
    GITHUB_API_BASE: "https://api.github.test",
    OPENCOLLECTIVE_BASE: "https://oc.test",
    OPENCOLLECTIVE_API_BASE: "https://api.oc.test",
    ...over,
  };
}

export const app = createApp();

export function call(path: string, init: RequestInit = {}, env: Env = makeEnv()): Promise<Response> {
  return Promise.resolve(app.fetch(new Request(ORIGIN + path, init), env));
}

/** A fake rate limiter: allows `limit` calls per key. */
export function fakeLimiter(limit: number): RateLimitBinding & { calls: string[] } {
  const counts = new Map<string, number>();
  const calls: string[] = [];
  return {
    calls,
    async limit({ key }) {
      calls.push(key);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { success: n <= limit };
    },
  };
}

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

export interface FakeProviders {
  requests: RecordedRequest[];
  /** Per-host override: return a Response to short-circuit the default behaviour. */
  override: Map<string, (req: RecordedRequest) => Response | Promise<Response>>;
  ghContributions: unknown;
  ocContributions: unknown;
  ghTarget: unknown;
  ocTarget: unknown;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Stub global fetch with fake GitHub / Open Collective endpoints:
 * - OAuth code "good" exchanges (any other code fails); access token "revoked" is rejected with 401.
 */
export function installFakeProviders(): FakeProviders {
  const state: FakeProviders = {
    requests: [],
    override: new Map(),
    ghContributions,
    ocContributions,
    ghTarget,
    ocTarget,
  };
  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const rec: RecordedRequest = { url: req.url, method: req.method, headers: req.headers, body: await req.text() };
    state.requests.push(rec);
    const url = new URL(rec.url);
    const ov = state.override.get(url.host);
    if (ov) return ov(rec);
    const auth = rec.headers.get("Authorization") ?? "";

    if (url.host === "github.test" && url.pathname === "/login/oauth/access_token") {
      const form = new URLSearchParams(rec.body);
      if (form.get("code") === "good" && form.get("code_verifier") && form.get("client_secret") === "gh-secret") {
        return json({ access_token: "gho_good", token_type: "bearer", scope: "read:org,read:user" });
      }
      return json({ error: "bad_verification_code", error_description: "The code passed is incorrect or expired." });
    }
    if (url.host === "api.github.test" && url.pathname === "/graphql") {
      if (auth === "Bearer gho_revoked") return json({ message: "Bad credentials" }, 401);
      const { query, variables } = JSON.parse(rec.body) as { query: string; variables: Record<string, unknown> };
      if (query.includes("SponsorkitViewer")) return json({ data: { viewer: GH_VIEWER } });
      if (query.includes("SponsorkitContributions")) return json({ data: state.ghContributions });
      if (query.includes("SponsorkitTarget")) {
        if (variables.login === "ghost-user") return json({ data: { repositoryOwner: null } });
        return json({ data: state.ghTarget });
      }
      return json({ errors: [{ message: "unknown query" }] }, 400);
    }
    if (url.host === "api.github.test" && url.pathname === "/zen") return new Response("Keep it logically awesome.");

    if (url.host === "oc.test" && url.pathname === "/oauth/token") {
      const form = new URLSearchParams(rec.body);
      if (form.get("code") === "good" && form.get("grant_type") === "authorization_code" && form.get("code_verifier")) {
        return json({ access_token: "oc_good", token_type: "Bearer", expires_in: 7776000, refresh_token: "r" });
      }
      return json({ error: "invalid_grant" }, 400);
    }
    if (url.host === "api.oc.test" && url.pathname === "/graphql/v2") {
      if (auth === "Bearer oc_revoked") return json({ error: { code: 401, message: "Invalid token" } }, 401);
      const { query, variables } = JSON.parse(rec.body) as { query: string; variables: Record<string, unknown> };
      if (query.includes("SponsorkitMe")) return json({ data: { me: OC_ME } });
      if (query.includes("SponsorkitContributions")) return json({ data: state.ocContributions });
      if (query.includes("SponsorkitTarget")) {
        if (variables.slug === "missing-collective") return json({ data: { account: null } });
        return json({ data: state.ocTarget });
      }
      if (query.includes("__typename")) return json({ data: { __typename: "Query" } });
      return json({ errors: [{ message: "unknown query" }] }, 400);
    }
    throw new Error(`unexpected fetch to ${rec.url}`);
  };
  vi.stubGlobal("fetch", vi.fn(handler));
  return state;
}

export const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
export const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

export async function newPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
  return { verifier, challenge: await challengeFor(verifier) };
}

export function getCookie(res: Response, name: string): string | null {
  const all = res.headers.getSetCookie();
  for (const c of all) {
    const [pair] = c.split(";");
    const i = pair!.indexOf("=");
    if (pair!.slice(0, i) === name) return pair!.slice(i + 1);
  }
  return null;
}
