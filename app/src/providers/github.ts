/**
 * GitHub Sponsors adapter (GraphQL API v4, schema verified against
 * https://docs.github.com/public/fpt/schema.docs.graphql).
 */
import type { Contribution, SponsorEntity, Target, TargetInfo, TargetTier } from "@sponsorkit/shared";
import { targetToString } from "@sponsorkit/shared";
import { base64Decode, base64urlDecode } from "../encoding";
import { providerUrls, requireSecret, type Env } from "../env";
import { contributionId } from "../ids";
import {
  OAuthExchangeError,
  ProviderAuthError,
  ProviderError,
  providerFetch,
  readJson,
  toIso,
  type GraphQLResponse,
  type ProviderAdapter,
  type ProviderIdentity,
  type ProviderToken,
} from "./types";

export const GITHUB_SCOPES = "read:user read:org";
const USER_AGENT = "sponsorkit.io";

// ---------- GraphQL documents ----------

const SPONSORSHIP_FIELDS = `
fragment SkSponsorship on Sponsorship {
  id
  createdAt
  isActive
  isOneTimePayment
  paymentSource
  privacyLevel
  tier { id name monthlyPriceInCents isOneTime isCustomAmount }
  sponsorable { ... on User { login } ... on Organization { login } }
  sponsorEntity { __typename ... on User { login databaseId } ... on Organization { login databaseId } }
}`;

export const CONTRIBUTIONS_QUERY = `query SponsorkitContributions($logins: [String!]!) {
  viewer {
    databaseId
    login
    sponsorshipsAsSponsor(first: 100, activeOnly: false, maintainerLogins: $logins) { nodes { ...SkSponsorship } }
    organizations(first: 100) {
      nodes {
        login
        databaseId
        sponsorshipsAsSponsor(first: 100, activeOnly: false, maintainerLogins: $logins) { nodes { ...SkSponsorship } }
      }
    }
  }
}
${SPONSORSHIP_FIELDS}`;

export const VIEWER_QUERY = `query SponsorkitViewer { viewer { databaseId login } }`;

const LISTING_FIELDS = `name sponsorsListing { url isPublic tiers(first: 100) { nodes { id name monthlyPriceInCents isOneTime isCustomAmount } } }`;

export const TARGET_QUERY = `query SponsorkitTarget($login: String!) {
  repositoryOwner(login: $login) {
    __typename
    login
    avatarUrl
    url
    ... on User { ${LISTING_FIELDS} }
    ... on Organization { ${LISTING_FIELDS} }
  }
}`;

// ---------- response types ----------

interface GhTier {
  id: string;
  name: string;
  monthlyPriceInCents: number;
  isOneTime: boolean;
  isCustomAmount: boolean;
}

export interface GhSponsorship {
  id: string;
  createdAt: string;
  isActive: boolean;
  isOneTimePayment: boolean;
  paymentSource: "GITHUB" | "PATREON" | null;
  privacyLevel: "PUBLIC" | "PRIVATE";
  tier: GhTier | null;
  sponsorable: { login?: string } | null;
  sponsorEntity: { __typename: "User" | "Organization"; login: string; databaseId: number | null } | null;
}

interface GhConnection<T> {
  nodes: Array<T | null> | null;
}

export interface GhContributionsData {
  viewer: {
    databaseId: number | null;
    login: string;
    sponsorshipsAsSponsor: GhConnection<GhSponsorship> | null;
    organizations: GhConnection<{
      login: string;
      databaseId: number | null;
      sponsorshipsAsSponsor: GhConnection<GhSponsorship> | null;
    }> | null;
  } | null;
}

export interface GhTargetData {
  repositoryOwner: {
    __typename: "User" | "Organization";
    login: string;
    avatarUrl: string;
    url: string;
    name?: string | null;
    sponsorsListing?: {
      url: string;
      isPublic: boolean;
      tiers: GhConnection<GhTier> | null;
    } | null;
  } | null;
}

// ---------- normalization (pure, exported for tests) ----------

/**
 * Map one GitHub sponsorship to a Contribution (SPEC §5.2):
 * one-time → paid; recurring active → active; recurring inactive → cancelled; PATREON → via_patreon.
 */
export async function normalizeSponsorship(
  s: GhSponsorship,
  target: Target,
  via: "direct" | "organization",
  fallbackSponsor: SponsorEntity,
): Promise<Contribution> {
  const oneTime = s.isOneTimePayment;
  const sponsor: SponsorEntity = s.sponsorEntity
    ? {
        type: s.sponsorEntity.__typename === "Organization" ? "organization" : "user",
        provider: "github",
        id: s.sponsorEntity.databaseId != null ? String(s.sponsorEntity.databaseId) : fallbackSponsor.id,
        handle: s.sponsorEntity.login ?? null,
      }
    : fallbackSponsor;
  return {
    id: await contributionId("github", s.id),
    provider: "github",
    target: targetToString(target),
    sponsor,
    via,
    kind: oneTime ? "one_time" : "recurring",
    frequency: oneTime ? "one_time" : "monthly",
    status: oneTime ? "paid" : s.isActive ? "active" : "cancelled",
    // GitHub exposes the amount only through the tier (custom amounts get their own tier).
    amount: { value: s.tier?.monthlyPriceInCents ?? 0, currency: "USD" },
    tier: s.tier ? { id: s.tier.id, name: s.tier.name } : null,
    flags: s.paymentSource === "PATREON" ? ["via_patreon"] : [],
    private: s.privacyLevel === "PRIVATE",
    startedAt: toIso(s.createdAt),
    endedAt: null,
    lastChargedAt: null,
    nextChargeAt: null,
    totalContributed: null,
  };
}

export async function normalizeContributions(data: GhContributionsData, target: Target): Promise<Contribution[]> {
  const viewer = data.viewer;
  if (!viewer) return [];
  const seen = new Set<string>();
  const out: Contribution[] = [];
  const add = async (nodes: Array<GhSponsorship | null> | null | undefined, via: "direct" | "organization", fallback: SponsorEntity) => {
    for (const s of nodes ?? []) {
      if (!s || seen.has(s.id)) continue;
      // maintainerLogins already filters; double-check against the session's target.
      if (s.sponsorable?.login && s.sponsorable.login.toLowerCase() !== target.account) continue;
      seen.add(s.id);
      out.push(await normalizeSponsorship(s, target, via, fallback));
    }
  };
  await add(viewer.sponsorshipsAsSponsor?.nodes, "direct", {
    type: "user",
    provider: "github",
    id: String(viewer.databaseId ?? ""),
    handle: viewer.login,
  });
  for (const org of viewer.organizations?.nodes ?? []) {
    if (!org) continue;
    await add(org.sponsorshipsAsSponsor?.nodes, "organization", {
      type: "organization",
      provider: "github",
      id: String(org.databaseId ?? ""),
      handle: org.login,
    });
  }
  return out;
}

/**
 * Best-effort numeric databaseId from a GitHub global node id, for `?tier_id=` links.
 * Next-gen ids are `<PREFIX>_<base64url(msgpack([0, ..., databaseId]))>`; legacy ids are
 * base64("<n>:SponsorsTier<databaseId>"). Returns null when the id can't be decoded.
 */
export function decodeGithubDatabaseId(nodeId: string): number | null {
  const us = nodeId.indexOf("_");
  if (us > 0) {
    try {
      return lastMsgpackInt(base64urlDecode(nodeId.slice(us + 1)));
    } catch {
      return null;
    }
  }
  try {
    const m = /^\d+:[A-Za-z]+(\d+)$/.exec(new TextDecoder().decode(base64Decode(nodeId)));
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** Decode a msgpack fixarray of non-negative ints and return the last one. */
function lastMsgpackInt(b: Uint8Array): number | null {
  let i = 0;
  const head = b[i++];
  if (head === undefined || (head & 0xf0) !== 0x90) return null;
  const n = head & 0x0f;
  let last: number | null = null;
  for (let k = 0; k < n; k++) {
    const t = b[i++];
    if (t === undefined) return null;
    if (t <= 0x7f) last = t;
    else if (t === 0xcc) last = b[i++] ?? NaN;
    else if (t === 0xcd) {
      last = ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
      i += 2;
    } else if (t === 0xce) {
      last = ((b[i] ?? 0) * 2 ** 24) + (((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0));
      i += 4;
    } else if (t === 0xcf) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = v * 256 + (b[i + j] ?? 0);
      last = v;
      i += 8;
    } else return null;
    if (i > b.length || Number.isNaN(last)) return null;
  }
  return i === b.length ? last : null;
}

export function normalizeTargetInfo(data: GhTargetData, target: Target): TargetInfo {
  const owner = data.repositoryOwner;
  const listing = owner?.sponsorsListing ?? null;
  const exists = !!owner && !!listing;
  const sponsorsUrl = `https://github.com/sponsors/${target.account}`;
  const tiers: TargetTier[] = [];
  for (const t of listing?.tiers?.nodes ?? []) {
    if (!t) continue;
    const dbId = decodeGithubDatabaseId(t.id);
    tiers.push({
      id: t.id,
      name: t.name,
      amount: { value: t.monthlyPriceInCents, currency: "USD" },
      frequency: t.isOneTime ? "one_time" : "monthly",
      url: dbId != null ? `${sponsorsUrl}/sponsorships?tier_id=${dbId}` : null,
    });
  }
  return {
    target: targetToString(target),
    provider: "github",
    account: target.account,
    exists,
    displayName: owner ? owner.name || owner.login : null,
    avatarUrl: owner?.avatarUrl ?? null,
    url: exists ? sponsorsUrl : owner?.url ?? null,
    currency: exists ? "USD" : null,
    frequencies: exists ? ["monthly", "one_time"] : [],
    customAmount: (listing?.tiers?.nodes ?? []).some((t) => !!t?.isCustomAmount),
    tiers,
  };
}

// ---------- adapter ----------

function isAuthGraphQLError(errors: GraphQLResponse<unknown>["errors"]): boolean {
  return (errors ?? []).some((e) => e.type === "UNAUTHENTICATED" || e.extensions?.code === "UNAUTHENTICATED");
}

export function githubAdapter(env: Env): ProviderAdapter {
  const urls = providerUrls(env);

  async function graphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<GraphQLResponse<T>> {
    const res = await providerFetch("github", `${urls.githubApi}/graphql`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401) throw new ProviderAuthError("github", "token rejected", 401);
    if (!res.ok) throw new ProviderError("github", `GraphQL HTTP ${res.status}`, res.status);
    const body = await readJson<GraphQLResponse<T>>("github", res);
    if (isAuthGraphQLError(body.errors)) throw new ProviderAuthError("github");
    return body;
  }

  return {
    provider: "github",
    // PKCE (S256) is supported for OAuth Apps since 2025-07-14 (GitHub changelog).
    supportsPkce: true,

    authorizeUrl({ redirectUri, state, codeChallenge }) {
      const u = new URL(`${urls.githubOAuth}/login/oauth/authorize`);
      u.searchParams.set("client_id", requireSecret(env, "GITHUB_CLIENT_ID"));
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("scope", GITHUB_SCOPES);
      u.searchParams.set("state", state);
      u.searchParams.set("code_challenge", codeChallenge);
      u.searchParams.set("code_challenge_method", "S256");
      u.searchParams.set("allow_signup", "false");
      return u.toString();
    },

    async exchangeCode(code, redirectUri, codeVerifier): Promise<ProviderToken> {
      const res = await providerFetch("github", `${urls.githubOAuth}/login/oauth/access_token`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
        body: new URLSearchParams({
          client_id: requireSecret(env, "GITHUB_CLIENT_ID"),
          client_secret: requireSecret(env, "GITHUB_CLIENT_SECRET"),
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });
      if (!res.ok) throw new OAuthExchangeError("github", `token HTTP ${res.status}`, res.status);
      // GitHub reports errors with HTTP 200 and an `error` field.
      const body = await readJson<{ access_token?: string; error?: string; expires_in?: number }>("github", res);
      if (body.error || !body.access_token) throw new OAuthExchangeError("github", `token error: ${body.error ?? "no token"}`);
      const token: ProviderToken = { accessToken: body.access_token };
      if (typeof body.expires_in === "number") token.expiresAt = Math.floor(Date.now() / 1000) + body.expires_in;
      return token;
    },

    async fetchIdentity(token): Promise<ProviderIdentity> {
      const body = await graphql<{ viewer: { databaseId: number | null; login: string } | null }>(token, VIEWER_QUERY, {});
      const v = body.data?.viewer;
      if (!v || v.databaseId == null) throw new ProviderError("github", "viewer missing");
      return { id: String(v.databaseId), handle: v.login };
    },

    async fetchContributions(token, _identity, target) {
      const body = await graphql<GhContributionsData>(token, CONTRIBUTIONS_QUERY, { logins: [target.account] });
      // Partial errors (e.g. an org restricting OAuth app access) still return the rest of `data`.
      if (!body.data?.viewer) throw new ProviderError("github", "viewer missing in response");
      return normalizeContributions(body.data, target);
    },

    async fetchTargetInfo(target) {
      const token = requireSecret(env, "GITHUB_METADATA_TOKEN");
      let body: GraphQLResponse<GhTargetData>;
      try {
        body = await graphql<GhTargetData>(token, TARGET_QUERY, { login: target.account });
      } catch (e) {
        // The metadata token is ours; a rejection is an outage, not a user reconnect.
        if (e instanceof ProviderAuthError) throw new ProviderError("github", "metadata token rejected", e.status);
        throw e;
      }
      if (!body.data) throw new ProviderError("github", "no data in target response");
      return normalizeTargetInfo(body.data, target);
    },

    async ping() {
      try {
        const res = await providerFetch("github", `${urls.githubApi}/zen`, { headers: { "User-Agent": USER_AGENT } }, 3000);
        return res.status < 500;
      } catch {
        return false;
      }
    },
  };
}
