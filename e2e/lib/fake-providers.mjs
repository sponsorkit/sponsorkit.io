/**
 * A tiny fake GitHub + Open Collective: OAuth (authorize page, token endpoint with real PKCE S256
 * verification) and the GraphQL queries the Worker sends (app/src/providers/*). One HTTP server,
 * four prefixes (see PROVIDER_BASES in config.mjs):
 *
 *   /gh/login/oauth/authorize   GET   consent page with "Authorize" / "Cancel" links
 *   /gh/login/oauth/access_token POST form → { access_token }
 *   /gh-api/graphql              POST  SponsorkitViewer | SponsorkitContributions | SponsorkitTarget
 *   /gh-api/zen                  GET
 *   /oc/oauth/authorize          GET
 *   /oc/oauth/token              POST
 *   /oc-api/graphql/v2           POST  SponsorkitMe | SponsorkitContributions | SponsorkitTarget | ping
 *
 * Test control (JSON):
 *   POST /__control/reset              → empty sponsorships, clear the log
 *   POST /__control/sponsorships       { provider, ...fields } → add one; returns it
 *   GET  /__control/log                → [{ at, what, ... }] (authorize / token / graphql calls)
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { API_ORIGIN, CLIENTS, FAKE, GITHUB_METADATA_TOKEN, MAINTAINER, SUPPORTER } from "./config.mjs";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const s256 = (verifier) => b64url(createHash("sha256").update(verifier, "ascii").digest());
/** GitHub legacy global node id, which the Worker decodes to a databaseId for `?tier_id=`. */
const ghNodeId = (type, dbId) => Buffer.from(`0:${type}${dbId}`).toString("base64");

export const GH_TIERS = [
  { id: ghNodeId("SponsorsTier", 501), name: "$5 a month", monthlyPriceInCents: 500, isOneTime: false, isCustomAmount: false },
  { id: ghNodeId("SponsorsTier", 502), name: "$25 a month", monthlyPriceInCents: 2500, isOneTime: false, isCustomAmount: false },
  { id: ghNodeId("SponsorsTier", 503), name: "$10 one time", monthlyPriceInCents: 1000, isOneTime: true, isCustomAmount: false },
];
export const OC_TIERS = [
  { id: "oc-tier-1", slug: "backer", name: "Backer", type: "TIER", frequency: "MONTHLY", amountType: "FIXED", amount: { valueInCents: 500, currency: "USD" } },
];

export function startFakeProviders({ port = FAKE.port, host = FAKE.host } = {}) {
  /** Pending authorization codes: code → { provider, clientId, redirectUri, challenge, user }. */
  const codes = new Map();
  /** Access tokens: token → { provider, user }. */
  const tokens = new Map();
  let sponsorships = [];
  let log = [];
  let seq = 0;

  const record = (what, extra = {}) => log.push({ at: Date.now(), what, ...extra });

  function addSponsorship(input) {
    const id = ++seq;
    if (input.provider === "opencollective") {
      const s = {
        provider: "opencollective",
        id: `oc-order-${id}`,
        status: input.status ?? "ACTIVE",
        frequency: input.frequency ?? "MONTHLY",
        createdAt: input.createdAt ?? new Date().toISOString(),
        cents: input.cents ?? 500,
        currency: input.currency ?? "USD",
        to: input.to ?? MAINTAINER.opencollective,
      };
      sponsorships.push(s);
      return s;
    }
    const tier = GH_TIERS.find((t) => t.monthlyPriceInCents === (input.cents ?? 500) && t.isOneTime === !!input.oneTime) ?? GH_TIERS[0];
    const s = {
      provider: "github",
      id: ghNodeId("Sponsorship", 9000 + id),
      createdAt: input.createdAt ?? new Date().toISOString(),
      isActive: input.isActive ?? true,
      oneTime: !!input.oneTime,
      tier,
      to: input.to ?? MAINTAINER.github,
    };
    sponsorships.push(s);
    return s;
  }

  // ---------- helpers ----------

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });

  const json = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const html = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Fake provider</title></head><body>${body}</body></html>`);
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const bearer = (req) => /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? null;

  // ---------- OAuth ----------

  function authorize(provider, url, res) {
    const p = url.searchParams;
    const client = CLIENTS[provider];
    const expectedRedirect = `${API_ORIGIN}/api/oauth/${provider}/callback`;
    const problems = [];
    if (p.get("client_id") !== client.id) problems.push(`client_id ${p.get("client_id")}`);
    if (p.get("redirect_uri") !== expectedRedirect) problems.push(`redirect_uri ${p.get("redirect_uri")} (expected ${expectedRedirect})`);
    if (p.get("code_challenge_method") !== "S256" || !p.get("code_challenge")) problems.push("missing PKCE S256 challenge");
    if (!p.get("state")) problems.push("missing state");
    if (provider === "opencollective" && p.get("response_type") !== "code") problems.push("response_type");
    record("authorize", { provider, ok: problems.length === 0, problems });
    if (problems.length) return html(res, 400, `<h1 id="error">Bad authorize request</h1><pre>${esc(problems.join("\n"))}</pre>`);

    const code = `fake_code_${b64url(randomBytes(12))}`;
    const user = provider === "github" ? SUPPORTER.github : SUPPORTER.opencollective;
    codes.set(code, { provider, clientId: client.id, redirectUri: p.get("redirect_uri"), challenge: p.get("code_challenge"), user, exp: Date.now() + 600_000 });
    const back = new URL(p.get("redirect_uri"));
    back.searchParams.set("code", code);
    back.searchParams.set("state", p.get("state"));
    const deny = new URL(p.get("redirect_uri"));
    deny.searchParams.set("error", "access_denied");
    deny.searchParams.set("state", p.get("state"));
    html(
      res,
      200,
      `<h1>Fake ${provider === "github" ? "GitHub" : "Open Collective"}</h1>
       <p>Authorize <strong>sponsorkit e2e</strong> as <strong id="user">${esc(user.login ?? user.slug)}</strong>?</p>
       <p>Scope: <code id="scope">${esc(p.get("scope") ?? "")}</code></p>
       <p><a id="authorize" href="${esc(back)}">Authorize</a> <a id="deny" href="${esc(deny)}">Cancel</a></p>`,
    );
  }

  async function token(provider, req, res) {
    const form = new URLSearchParams(await readBody(req));
    const client = CLIENTS[provider];
    const entry = codes.get(form.get("code") ?? "");
    const fail = (error) => {
      record("token", { provider, ok: false, error });
      // GitHub reports errors with 200; OC with 400.
      return json(res, provider === "github" ? 200 : 400, { error });
    };
    if (form.get("client_id") !== client.id || form.get("client_secret") !== client.secret) return fail("incorrect_client_credentials");
    if (provider === "opencollective" && form.get("grant_type") !== "authorization_code") return fail("unsupported_grant_type");
    if (!entry || entry.provider !== provider || entry.exp < Date.now()) return fail("bad_verification_code");
    codes.delete(form.get("code"));
    if (form.get("redirect_uri") !== entry.redirectUri) return fail("redirect_uri_mismatch");
    if (s256(form.get("code_verifier") ?? "") !== entry.challenge) return fail("invalid_grant (PKCE)");
    const accessToken = `${provider === "github" ? "gho" : "oc"}_fake_${b64url(randomBytes(12))}`;
    tokens.set(accessToken, { provider, user: entry.user });
    record("token", { provider, ok: true });
    json(res, 200, provider === "github" ? { access_token: accessToken, token_type: "bearer", scope: "read:user,read:org" } : { access_token: accessToken, expires_in: 3600 });
  }

  // ---------- GitHub GraphQL ----------

  function ghSponsorshipNode(s) {
    return {
      id: s.id,
      createdAt: s.createdAt,
      isActive: s.isActive,
      isOneTimePayment: s.oneTime,
      paymentSource: "GITHUB",
      privacyLevel: "PUBLIC",
      tier: s.tier,
      sponsorable: { login: s.to },
      sponsorEntity: { __typename: "User", login: SUPPORTER.github.login, databaseId: SUPPORTER.github.databaseId },
    };
  }

  async function ghGraphql(req, res) {
    const { query = "", variables = {} } = JSON.parse((await readBody(req)) || "{}");
    const tok = bearer(req);
    const op = /query (Sponsorkit\w+)/.exec(query)?.[1] ?? "unknown";
    record("graphql", { provider: "github", op });
    if (op === "SponsorkitTarget") {
      if (tok !== GITHUB_METADATA_TOKEN) return json(res, 401, { message: "Bad credentials" });
      const login = String(variables.login ?? "").toLowerCase();
      if (login !== MAINTAINER.github) return json(res, 200, { data: { repositoryOwner: null } });
      return json(res, 200, {
        data: {
          repositoryOwner: {
            __typename: "User",
            login,
            name: "Octo Maintainer",
            avatarUrl: `http://${FAKE.host}:${FAKE.port}/avatar.png`,
            url: `https://github.com/${login}`,
            sponsorsListing: { url: `https://github.com/sponsors/${login}`, isPublic: true, tiers: { nodes: GH_TIERS } },
          },
        },
      });
    }
    const session = tok ? tokens.get(tok) : null;
    if (!session || session.provider !== "github") return json(res, 401, { message: "Bad credentials" });
    const viewer = { databaseId: session.user.databaseId, login: session.user.login };
    if (op === "SponsorkitViewer") return json(res, 200, { data: { viewer } });
    if (op === "SponsorkitContributions") {
      const logins = (variables.logins ?? []).map((l) => String(l).toLowerCase());
      const nodes = sponsorships.filter((s) => s.provider === "github" && logins.includes(s.to)).map(ghSponsorshipNode);
      return json(res, 200, { data: { viewer: { ...viewer, sponsorshipsAsSponsor: { nodes }, organizations: { nodes: [] } } } });
    }
    json(res, 200, { errors: [{ message: `fake: unknown operation ${op}` }] });
  }

  // ---------- Open Collective GraphQL ----------

  function ocOrderNode(s) {
    const amount = { valueInCents: s.cents, currency: s.currency };
    return {
      id: s.id,
      status: s.status,
      frequency: s.frequency,
      createdAt: s.createdAt,
      lastChargedAt: s.createdAt,
      nextChargeDate: null,
      amount,
      totalContributed: amount,
      tier: null,
      fromAccount: { id: SUPPORTER.opencollective.id, slug: SUPPORTER.opencollective.slug, type: "INDIVIDUAL", isIncognito: false },
      toAccount: { slug: s.to },
    };
  }

  async function ocGraphql(req, res) {
    const { query = "", variables = {} } = JSON.parse((await readBody(req)) || "{}");
    const tok = bearer(req);
    const op = /query (Sponsorkit\w+)/.exec(query)?.[1] ?? (query.includes("__typename") ? "ping" : "unknown");
    record("graphql", { provider: "opencollective", op });
    if (op === "ping") return json(res, 200, { data: { __typename: "Query" } });
    if (op === "SponsorkitTarget") {
      const slug = String(variables.slug ?? "").toLowerCase();
      if (slug !== MAINTAINER.opencollective) return json(res, 200, { data: { account: null } });
      return json(res, 200, {
        data: {
          account: {
            id: "oc-collective-1",
            slug,
            type: "COLLECTIVE",
            name: "Octo Collective",
            imageUrl: null,
            currency: "USD",
            isActive: true,
            isArchived: false,
            tiers: { nodes: OC_TIERS },
          },
        },
      });
    }
    const session = tok ? tokens.get(tok) : null;
    if (!session || session.provider !== "opencollective") return json(res, 401, { errors: [{ message: "Unauthorized", extensions: { code: "UNAUTHENTICATED" } }] });
    const me = { id: session.user.id, slug: session.user.slug };
    if (op === "SponsorkitMe") return json(res, 200, { data: { me } });
    if (op === "SponsorkitContributions") {
      const slug = String(variables.slug ?? "").toLowerCase();
      if (slug !== MAINTAINER.opencollective) return json(res, 200, { data: { target: null, me: null } });
      const nodes = sponsorships.filter((s) => s.provider === "opencollective" && s.to === slug).map(ocOrderNode);
      return json(res, 200, { data: { target: { id: "oc-collective-1" }, me: { ...me, orders: { nodes }, memberOf: { nodes: [] } } } });
    }
    json(res, 200, { errors: [{ message: `fake: unknown operation ${op}` }] });
  }

  // ---------- server ----------

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const route = `${req.method} ${url.pathname}`;
      switch (route) {
        case "GET /gh/login/oauth/authorize":
          return authorize("github", url, res);
        case "POST /gh/login/oauth/access_token":
          return await token("github", req, res);
        case "POST /gh-api/graphql":
          return await ghGraphql(req, res);
        case "GET /gh-api/zen":
          res.writeHead(200, { "Content-Type": "text/plain" });
          return res.end("Keep it logically awesome.");
        case "GET /oc/oauth/authorize":
          return authorize("opencollective", url, res);
        case "POST /oc/oauth/token":
          return await token("opencollective", req, res);
        case "POST /oc-api/graphql/v2":
          return await ocGraphql(req, res);
        case "POST /__control/reset":
          sponsorships = [];
          log = [];
          codes.clear();
          return json(res, 200, { ok: true });
        case "POST /__control/sponsorships":
          return json(res, 200, addSponsorship(JSON.parse((await readBody(req)) || "{}")));
        case "GET /__control/log":
          return json(res, 200, log);
        case "GET /health":
          return json(res, 200, { ok: true });
        default:
          return json(res, 404, { message: `fake: no route ${route}` });
      }
    } catch (e) {
      json(res, 500, { message: String(e?.stack ?? e) });
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () =>
      resolve({
        server,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
            server.closeAllConnections();
          }),
        addSponsorship,
        reset() {
          sponsorships = [];
          log = [];
          codes.clear();
        },
        get log() {
          return log;
        },
      }),
    );
  });
}
