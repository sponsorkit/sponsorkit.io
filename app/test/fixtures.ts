/**
 * Provider responses modelled on the documented schemas:
 * - GitHub GraphQL: Sponsorship, SponsorsTier, SponsorsListing, User/Organization.sponsorshipsAsSponsor
 * - Open Collective GraphQL v2: Order, Amount, Tier, Account.orders/memberOf, Query.account
 */
import type { GhContributionsData, GhTargetData } from "../src/providers/github";
import type { OcContributionsData, OcOrder, OcTargetData } from "../src/providers/opencollective";

export const GH_VIEWER = { databaseId: 583231, login: "alice" };

export const ghContributions: GhContributionsData = {
  viewer: {
    databaseId: 583231,
    login: "alice",
    sponsorshipsAsSponsor: {
      nodes: [
        {
          id: "S_kwDOAAjmP84AAQAB",
          createdAt: "2026-03-01T10:00:00Z",
          isActive: true,
          isOneTimePayment: false,
          paymentSource: "GITHUB",
          privacyLevel: "PUBLIC",
          tier: { id: "ST_kwDOAAQ0Bs4AAZ8q", name: "$5 a month", monthlyPriceInCents: 500, isOneTime: false, isCustomAmount: false },
          sponsorable: { login: "MathiasLorenzen" },
          sponsorEntity: { __typename: "User", login: "alice", databaseId: 583231 },
        },
        {
          id: "S_kwDOAAjmP84AAQAC",
          createdAt: "2025-12-24T08:30:00Z",
          isActive: false,
          isOneTimePayment: true,
          paymentSource: "GITHUB",
          privacyLevel: "PRIVATE",
          tier: { id: "ST_kwDOAAQ0Bs4AAZ8r", name: "$25 one time", monthlyPriceInCents: 2500, isOneTime: true, isCustomAmount: false },
          sponsorable: { login: "mathiaslorenzen" },
          sponsorEntity: { __typename: "User", login: "alice", databaseId: 583231 },
        },
        {
          id: "S_kwDOAAjmP84AAQAD",
          createdAt: "2024-01-01T00:00:00Z",
          isActive: false,
          isOneTimePayment: false,
          paymentSource: "PATREON",
          privacyLevel: "PUBLIC",
          tier: { id: "ST_kwDOAAQ0Bs4AAZ8s", name: "Custom", monthlyPriceInCents: 1200, isOneTime: false, isCustomAmount: true },
          sponsorable: { login: "mathiaslorenzen" },
          sponsorEntity: { __typename: "User", login: "alice", databaseId: 583231 },
        },
      ],
    },
    organizations: {
      nodes: [
        {
          login: "acme",
          databaseId: 9001,
          sponsorshipsAsSponsor: {
            nodes: [
              {
                id: "S_kwDOAAjmP84AAQAE",
                createdAt: "2026-06-15T12:00:00Z",
                isActive: true,
                isOneTimePayment: false,
                paymentSource: null,
                privacyLevel: "PUBLIC",
                tier: { id: "ST_kwDOAAQ0Bs4AAZ8t", name: "Gold", monthlyPriceInCents: 10000, isOneTime: false, isCustomAmount: false },
                sponsorable: { login: "mathiaslorenzen" },
                sponsorEntity: { __typename: "Organization", login: "acme", databaseId: 9001 },
              },
            ],
          },
        },
        // An org whose sponsorships the token can't read (OAuth app restrictions): null connection.
        { login: "restricted", databaseId: 9002, sponsorshipsAsSponsor: null },
      ],
    },
  },
};

export const ghTarget: GhTargetData = {
  repositoryOwner: {
    __typename: "User",
    login: "MathiasLorenzen",
    avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
    url: "https://github.com/MathiasLorenzen",
    name: "Mathias Lorenzen",
    sponsorsListing: {
      url: "https://github.com/sponsors/MathiasLorenzen",
      isPublic: true,
      tiers: {
        nodes: [
          { id: "ST_kwDOAAQ0Bs4AAZ8q", name: "$5 a month", monthlyPriceInCents: 500, isOneTime: false, isCustomAmount: false },
          { id: "ST_kwDOAAQ0Bs4AAZ8r", name: "$25 one time", monthlyPriceInCents: 2500, isOneTime: true, isCustomAmount: false },
          { id: "ST_kwDOAAQ0Bs4AAZ8s", name: "Custom", monthlyPriceInCents: 100, isOneTime: false, isCustomAmount: true },
        ],
      },
    },
  },
};

export const OC_ME = { id: "eyl0ab3m-aaaa-bbbb-cccc-000000000001", slug: "bob" };

const order = (over: Partial<OcOrder>): OcOrder => ({
  id: "ord_0",
  status: "ACTIVE",
  frequency: "MONTHLY",
  createdAt: "2026-02-01T00:00:00.000Z",
  lastChargedAt: "2026-11-01T00:00:00.000Z",
  nextChargeDate: "2026-12-01T00:00:00.000Z",
  amount: { valueInCents: 1000, currency: "EUR" },
  totalContributed: { valueInCents: 10000, currency: "EUR" },
  tier: { id: "tier_backer", name: "Backer" },
  fromAccount: { id: OC_ME.id, slug: "bob", type: "INDIVIDUAL", isIncognito: false },
  toAccount: { slug: "sponsorkit" },
  ...over,
});

export const ocContributions: OcContributionsData = {
  me: {
    id: OC_ME.id,
    slug: "bob",
    orders: {
      nodes: [
        order({ id: "ord_monthly" }),
        order({
          id: "ord_once",
          status: "PAID",
          frequency: "ONETIME",
          amount: { valueInCents: 5000, currency: "EUR" },
          totalContributed: { valueInCents: 5000, currency: "EUR" },
          lastChargedAt: null,
          nextChargeDate: null,
          tier: null,
          fromAccount: { id: "incog_1", slug: "incognito-123", type: "INDIVIDUAL", isIncognito: true },
        }),
        order({ id: "ord_yearly", status: "EXPIRED", frequency: "YEARLY", nextChargeDate: null }),
        order({ id: "ord_weird", status: "SOMETHING_NEW", frequency: "MONTHLY" }),
        // Defensive: an order to another account is filtered out.
        order({ id: "ord_other", toAccount: { slug: "someone-else" } }),
      ],
    },
    memberOf: {
      nodes: [
        {
          account: {
            id: "org_acme",
            slug: "acme-corp",
            type: "ORGANIZATION",
            orders: {
              nodes: [
                order({
                  id: "ord_org",
                  status: "ERROR",
                  amount: { valueInCents: 25000, currency: "EUR" },
                  fromAccount: { id: "org_acme", slug: "acme-corp", type: "ORGANIZATION", isIncognito: false },
                }),
              ],
            },
          },
        },
        { account: null },
      ],
    },
  },
};

export const ocTarget: OcTargetData = {
  account: {
    id: "acc_sponsorkit",
    slug: "sponsorkit",
    type: "COLLECTIVE",
    name: "Sponsorkit",
    imageUrl: "https://images.opencollective.com/sponsorkit/logo.png",
    currency: "EUR",
    tiers: {
      nodes: [
        { id: "tier_backer", slug: "backer", name: "Backer", type: "TIER", frequency: "MONTHLY", amountType: "FIXED", amount: { valueInCents: 500, currency: "EUR" } },
        { id: "tier_sponsor", slug: "sponsor", name: "Sponsor", type: "TIER", frequency: "YEARLY", amountType: "FIXED", amount: { valueInCents: 10000, currency: "EUR" } },
        { id: "tier_ticket", slug: "ticket", name: "Ticket", type: "TICKET", frequency: "ONETIME", amountType: "FIXED", amount: { valueInCents: 2000, currency: "EUR" } },
        { id: "tier_flex", slug: "flex", name: "Flexible", type: "DONATION", frequency: "FLEXIBLE", amountType: "FLEXIBLE", amount: { valueInCents: 0, currency: "EUR" } },
      ],
    },
  },
};
