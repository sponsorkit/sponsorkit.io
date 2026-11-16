/**
 * Open Collective adapter (GraphQL API v2, schema verified against
 * opencollective-api/server/graphql/schemaV2.graphql).
 */
import type { Contribution, Frequency, Money, SponsorEntity, Status, Target, TargetInfo, TargetTier } from "@sponsorkit/shared";
import { targetToString } from "@sponsorkit/shared";
import { providerUrls, requireSecret, type Env } from "../env";
import { contributionId } from "../ids";
import { logEvent } from "../log";
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

/** OC's OAuth server splits scopes on commas or whitespace. */
export const OC_SCOPES = "orders incognito";
/** OC OAuth access tokens live 90 days (TOKEN_EXPIRATION_SESSION_OAUTH) when expires_in is absent. */
const DEFAULT_TOKEN_TTL = 90 * 24 * 3600;

// ---------- GraphQL documents ----------

const ORDER_FIELDS = `
fragment SkOrder on Order {
  id
  status
  frequency
  createdAt
  lastChargedAt
  nextChargeDate
  amount { valueInCents currency }
  totalContributed { valueInCents currency }
  tier { id name }
  fromAccount { id slug type isIncognito }
  toAccount { slug }
}`;

export const CONTRIBUTIONS_QUERY = `query SponsorkitContributions($slug: String!) {
  me {
    id
    slug
    orders(filter: OUTGOING, oppositeAccount: { slug: $slug }, includeIncognito: true, limit: 100) { nodes { ...SkOrder } }
    memberOf(role: [ADMIN], limit: 100) {
      nodes {
        account {
          id
          slug
          type
          orders(filter: OUTGOING, oppositeAccount: { slug: $slug }, limit: 100) { nodes { ...SkOrder } }
        }
      }
    }
  }
}
${ORDER_FIELDS}`;

export const ME_QUERY = `query SponsorkitMe { me { id slug } }`;

export const TARGET_QUERY = `query SponsorkitTarget($slug: String!) {
  account(slug: $slug, throwIfMissing: false) {
    id
    slug
    type
    name
    imageUrl
    currency
    ... on AccountWithContributions {
      tiers(limit: 100) {
        nodes { id slug name type frequency amountType amount { valueInCents currency } }
      }
    }
  }
}`;

// ---------- response types ----------

interface OcAmount {
  valueInCents: number | null;
  currency: string | null;
}

export interface OcOrder {
  id: string;
  status: string | null;
  frequency: "MONTHLY" | "YEARLY" | "ONETIME" | null;
  createdAt: string | null;
  lastChargedAt: string | null;
  nextChargeDate: string | null;
  amount: OcAmount | null;
  totalContributed: OcAmount | null;
  tier: { id: string; name: string | null } | null;
  fromAccount: { id: string; slug: string; type: string; isIncognito: boolean } | null;
  toAccount: { slug: string } | null;
}

interface OcCollection<T> {
  nodes: Array<T | null> | null;
}

export interface OcContributionsData {
  me: {
    id: string;
    slug: string;
    orders: OcCollection<OcOrder> | null;
    memberOf: OcCollection<{
      account: { id: string; slug: string; type: string; orders: OcCollection<OcOrder> | null } | null;
    }> | null;
  } | null;
}

export interface OcTargetData {
  account: {
    id: string;
    slug: string;
    type: string;
    name: string | null;
    imageUrl: string | null;
    currency: string | null;
    tiers?: OcCollection<{
      id: string;
      slug: string | null;
      name: string | null;
      type: string;
      frequency: "MONTHLY" | "YEARLY" | "ONETIME" | "FLEXIBLE";
      amountType: "FIXED" | "FLEXIBLE";
      amount: OcAmount | null;
    }> | null;
  } | null;
}

// ---------- normalization ----------

const STATUS_MAP: Record<string, Status> = {
  ACTIVE: "active",
  PAID: "paid",
  PAUSED: "paused",
  CANCELLED: "cancelled",
  EXPIRED: "cancelled",
  REFUNDED: "refunded",
  DISPUTED: "disputed",
  ERROR: "failed",
  REJECTED: "failed",
  NEW: "pending",
  PENDING: "pending",
  PROCESSING: "pending",
  REQUIRE_CLIENT_CONFIRMATION: "pending",
  IN_REVIEW: "pending",
};

/** SPEC §5.2; unknown values map to `pending` and are logged. */
export function mapOrderStatus(status: string | null): Status {
  const mapped = status ? STATUS_MAP[status] : undefined;
  if (mapped) return mapped;
  logEvent("warn", { msg: "unknown_provider_status", provider: "opencollective", status: status ?? null });
  return "pending";
}

function mapFrequency(f: string | null): Frequency {
  if (f === "MONTHLY") return "monthly";
  if (f === "YEARLY") return "yearly";
  return "one_time";
}

function toMoney(a: OcAmount | null | undefined): Money | null {
  if (!a || a.valueInCents == null || !a.currency || !/^[A-Z]{3}$/.test(a.currency)) return null;
  return { value: Math.round(a.valueInCents), currency: a.currency };
}

export async function normalizeOrder(
  o: OcOrder,
  target: Target,
  via: "direct" | "organization",
  sponsor: SponsorEntity,
): Promise<Contribution | null> {
  const amount = toMoney(o.amount);
  if (!amount) {
    logEvent("warn", { msg: "order_without_amount", provider: "opencollective" });
    return null;
  }
  const frequency = mapFrequency(o.frequency);
  return {
    id: await contributionId("opencollective", o.id),
    provider: "opencollective",
    target: targetToString(target),
    sponsor,
    via,
    kind: frequency === "one_time" ? "one_time" : "recurring",
    frequency,
    status: mapOrderStatus(o.status),
    amount,
    tier: o.tier ? { id: o.tier.id, name: o.tier.name ?? "" } : null,
    flags: [],
    private: !!o.fromAccount?.isIncognito,
    startedAt: toIso(o.createdAt),
    endedAt: null,
    lastChargedAt: toIso(o.lastChargedAt),
    nextChargeAt: toIso(o.nextChargeDate),
    totalContributed: toMoney(o.totalContributed),
  };
}

export async function normalizeContributions(
  data: OcContributionsData,
  identity: ProviderIdentity,
  target: Target,
): Promise<Contribution[]> {
  const me = data.me;
  if (!me) return [];
  const seen = new Set<string>();
  const out: Contribution[] = [];
  const add = async (nodes: Array<OcOrder | null> | null | undefined, via: "direct" | "organization", sponsor: SponsorEntity) => {
    for (const o of nodes ?? []) {
      if (!o || seen.has(o.id)) continue;
      if (o.toAccount?.slug && o.toAccount.slug.toLowerCase() !== target.account) continue;
      seen.add(o.id);
      const c = await normalizeOrder(o, target, via, sponsor);
      if (c) out.push(c);
    }
  };
  await add(me.orders?.nodes, "direct", { type: "user", provider: "opencollective", id: identity.id, handle: me.slug ?? identity.handle });
  for (const m of me.memberOf?.nodes ?? []) {
    const acc = m?.account;
    if (!acc || acc.id === me.id) continue;
    await add(acc.orders?.nodes, "organization", { type: "organization", provider: "opencollective", id: acc.id, handle: acc.slug });
  }
  return out;
}

/** Account types that can receive contributions. */
const CONTRIBUTABLE = new Set(["COLLECTIVE", "PROJECT", "EVENT", "FUND", "ORGANIZATION"]);
/** Tier types that are contributions (not tickets/products/services). */
const CONTRIBUTION_TIER_TYPES = new Set(["TIER", "MEMBERSHIP", "DONATION"]);

export function normalizeTargetInfo(data: OcTargetData, target: Target, ocBase = "https://opencollective.com"): TargetInfo {
  const acc = data.account;
  const exists = !!acc && CONTRIBUTABLE.has(acc.type);
  const tiers: TargetTier[] = [];
  for (const t of acc?.tiers?.nodes ?? []) {
    if (!t || !CONTRIBUTION_TIER_TYPES.has(t.type) || t.frequency === "FLEXIBLE") continue;
    const amount = toMoney(t.amount);
    if (!amount) continue;
    tiers.push({ id: t.id, name: t.name ?? "", amount, frequency: mapFrequency(t.frequency), url: null });
  }
  return {
    target: targetToString(target),
    provider: "opencollective",
    account: target.account,
    exists,
    displayName: acc ? acc.name || acc.slug : null,
    avatarUrl: acc?.imageUrl ?? null,
    url: acc ? `${ocBase}/${acc.slug}` : null,
    currency: exists ? acc!.currency ?? null : null,
    frequencies: exists ? ["one_time", "monthly", "yearly"] : [],
    customAmount: exists,
    tiers,
  };
}

// ---------- adapter ----------

const AUTH_CODES = new Set(["UNAUTHENTICATED", "Unauthorized", "UNAUTHORIZED"]);

export function opencollectiveAdapter(env: Env): ProviderAdapter {
  const urls = providerUrls(env);

  async function graphql<T>(token: string | null, query: string, variables: Record<string, unknown>): Promise<GraphQLResponse<T>> {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await providerFetch("opencollective", `${urls.ocApi}/graphql/v2`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401 && token) throw new ProviderAuthError("opencollective", "token rejected", 401);
    if (!res.ok) throw new ProviderError("opencollective", `GraphQL HTTP ${res.status}`, res.status);
    const body = await readJson<GraphQLResponse<T>>("opencollective", res);
    if (token && (body.errors ?? []).some((e) => AUTH_CODES.has(e.extensions?.code ?? ""))) {
      throw new ProviderAuthError("opencollective");
    }
    return body;
  }

  return {
    provider: "opencollective",
    // OC's OAuth server (node-oauth2-server model) stores codeChallenge/codeChallengeMethod.
    supportsPkce: true,

    authorizeUrl({ redirectUri, state, codeChallenge }) {
      const u = new URL(`${urls.ocBase}/oauth/authorize`);
      u.searchParams.set("client_id", requireSecret(env, "OPENCOLLECTIVE_CLIENT_ID"));
      u.searchParams.set("response_type", "code");
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("scope", OC_SCOPES);
      u.searchParams.set("state", state);
      u.searchParams.set("code_challenge", codeChallenge);
      u.searchParams.set("code_challenge_method", "S256");
      return u.toString();
    },

    async exchangeCode(code, redirectUri, codeVerifier): Promise<ProviderToken> {
      const res = await providerFetch("opencollective", `${urls.ocBase}/oauth/token`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: requireSecret(env, "OPENCOLLECTIVE_CLIENT_ID"),
          client_secret: requireSecret(env, "OPENCOLLECTIVE_CLIENT_SECRET"),
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });
      if (!res.ok) throw new OAuthExchangeError("opencollective", `token HTTP ${res.status}`, res.status);
      const body = await readJson<{ access_token?: string; expires_in?: number; error?: string }>("opencollective", res);
      if (body.error || !body.access_token) throw new OAuthExchangeError("opencollective", `token error: ${body.error ?? "no token"}`);
      const ttl = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : DEFAULT_TOKEN_TTL;
      return { accessToken: body.access_token, expiresAt: Math.floor(Date.now() / 1000) + ttl };
    },

    async fetchIdentity(token): Promise<ProviderIdentity> {
      const body = await graphql<{ me: { id: string; slug: string } | null }>(token, ME_QUERY, {});
      const me = body.data?.me;
      if (!me) throw new ProviderAuthError("opencollective", "me is null");
      return { id: me.id, handle: me.slug };
    },

    async fetchContributions(token, identity, target) {
      const body = await graphql<OcContributionsData>(token, CONTRIBUTIONS_QUERY, { slug: target.account });
      if (body.data && body.data.me === null && !body.errors?.length) throw new ProviderAuthError("opencollective", "me is null");
      if (!body.data?.me) throw new ProviderError("opencollective", "me missing in response");
      return normalizeContributions(body.data, identity, target);
    },

    async fetchTargetInfo(target) {
      const body = await graphql<OcTargetData>(null, TARGET_QUERY, { slug: target.account });
      if (!body.data) throw new ProviderError("opencollective", "no data in target response");
      return normalizeTargetInfo(body.data, target, urls.ocBase);
    },

    async ping() {
      try {
        const res = await providerFetch(
          "opencollective",
          `${urls.ocApi}/graphql/v2`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "{ __typename }" }) },
          3000,
        );
        return res.status < 500;
      } catch {
        return false;
      }
    },
  };
}
