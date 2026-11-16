import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Code } from "@/components/code";
import { PROTOCOL_URL, REPO_URL, SPEC_URL } from "@/components/chrome";
import {
  cacheSnippet,
  checkoutSnippet,
  helpersSnippet,
  languages,
  mockEnv,
  mockSnippet,
  nagSnippet,
  orgSnippet,
  resultShape,
  selfHostClient,
  selfHostSnippet,
  verifyCurl,
  verifySnippet,
} from "@/content/snippets";

export const metadata: Metadata = {
  title: "Docs",
  description: "Get started with Sponsorkit in JavaScript/TypeScript, .NET, Python, Go or Rust.",
};

type TocItem = { id: string; title: string; children?: TocItem[] };

const toc: TocItem[] = [
  { id: "getting-started", title: "Getting started" },
  {
    id: "quickstarts",
    title: "Quickstarts",
    children: languages.map((l) => ({ id: `quickstart-${l.id}`, title: l.name })),
  },
  {
    id: "concepts",
    title: "Concepts",
    children: [
      { id: "targets", title: "Targets" },
      { id: "sessions", title: "Sign-in & sessions" },
      { id: "contributions", title: "Contribution shape" },
      { id: "statuses", title: "Statuses" },
      { id: "organizations", title: "Organization sponsorships" },
      { id: "caching", title: "Caching & freshness" },
      { id: "checkout", title: "Checkout" },
      { id: "nag", title: "Nag helper" },
      { id: "mock-mode", title: "Mock mode" },
      { id: "backend-verification", title: "Backend verification" },
      { id: "error-contract", title: "Error contract" },
      { id: "self-hosting", title: "Self-hosting" },
    ],
  },
  { id: "protocol", title: "Wire protocol" },
];

function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id}>
      <a className="heading-anchor" href={`#${id}`}>
        {children}
      </a>
    </h2>
  );
}

function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id}>
      <a className="heading-anchor" href={`#${id}`}>
        {children}
      </a>
    </h3>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={head.join(", ")}>
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TocList({ items }: { items: TocItem[] }) {
  return (
    <ol>
      {items.map((i) => (
        <li key={i.id}>
          <a href={`#${i.id}`}>{i.title}</a>
          {i.children ? <TocList items={i.children} /> : null}
        </li>
      ))}
    </ol>
  );
}

export default function DocsPage() {
  return (
    <div className="container docs-layout">
      <nav className="docs-toc" aria-label="On this page">
        <details open>
          <summary>On this page</summary>
          <TocList items={toc} />
        </details>
      </nav>

      <article className="prose">
        <h1>Documentation</h1>
        <p className="lede">
          Sponsorkit tells your software whether the current user supports you on GitHub Sponsors or Open Collective, and helps
          them start. You write the rule; Sponsorkit reports the facts.
        </p>

        <H2 id="getting-started">Getting started</H2>
        <ol>
          <li>
            <strong>Install the SDK</strong> for your language (see the quickstarts below).
          </li>
          <li>
            <strong>Name your targets:</strong> the GitHub login and/or Open Collective slug you receive sponsorships on. There’s no
            account to create and no key to copy.
          </li>
          <li>
            <strong>Call</strong> <code>getFinancialContribution()</code>. If the user isn’t signed in, you get a signed-out result
            without any network call. Call <code>signIn()</code> when it makes sense, e.g. from a “Link your sponsorship” button.
          </li>
          <li>
            <strong>Decide</strong> what to do with the result: show an ad, nag every N runs, unlock a feature. Sponsorkit never
            decides for you.
          </li>
        </ol>
        <div className="callout">
          <p>
            Try it without signing in: set <code>mock: &quot;active-monthly&quot;</code> (or <code>SPONSORKIT_MOCK=active-monthly</code>
            ) and Sponsorkit returns a realistic result without touching the network. See <a href="#mock-mode">mock mode</a>.
          </p>
        </div>

        <H2 id="quickstarts">Quickstarts</H2>
        <p>
          Every SDK has the same behaviour, the same result shape and the same <a href="#error-contract">error contract</a>; only
          the naming follows each language’s conventions.
        </p>
        <Table
          head={["", "Package", "Get contributions", "Sign-in methods"]}
          rows={[
            ["JS/TS", <code key="p">@sponsorkit/sdk</code>, <code key="g">getFinancialContribution()</code>, "popup, redirect, loopback, paste"],
            [".NET", <code key="p">Sponsorkit</code>, <code key="g">GetFinancialContributionAsync(ct)</code>, "loopback, paste"],
            ["Python", <code key="p">sponsorkit</code>, <code key="g">get_financial_contribution()</code>, "loopback, paste"],
            ["Go", <code key="p">github.com/sponsorkit/sponsorkit.io/sdks/go</code>, <code key="g">GetFinancialContribution(ctx)</code>, "loopback, paste"],
            ["Rust", <code key="p">sponsorkit</code>, <code key="g">get_financial_contribution().await</code>, "loopback, paste"],
          ]}
        />
        {languages.map((l) => (
          <section key={l.id} aria-labelledby={`quickstart-${l.id}`}>
            <H3 id={`quickstart-${l.id}`}>{l.name}</H3>
            <p className="muted">{l.runtime}</p>
            <Code code={l.install} lang={l.installLang} title="Terminal" />
            <Code code={l.code} lang={l.lang} title={l.file} />
          </section>
        ))}
        <p className="small muted">
          The JavaScript SDK also ships web components (<code>&lt;sponsorkit-button&gt;</code>, <code>&lt;sponsorkit-badge&gt;</code>)
          from <code>@sponsorkit/sdk/elements</code>. Each SDK’s README lists its full API.
        </p>

        <H2 id="concepts">Concepts</H2>

        <H3 id="targets">Targets</H3>
        <p>
          A <strong>target</strong> is an account you receive sponsorships on: <code>github:&lt;login&gt;</code> or{" "}
          <code>opencollective:&lt;slug&gt;</code>. An SDK instance has a <strong>target set</strong> of one or more targets, at most
          one per provider. Accounts are lowercased, and the set is sorted, so <code>{`{ github: "Octocat" }`}</code> and{" "}
          <code>{`{ github: "octocat" }`}</code> are the same.
        </p>
        <p>
          The target set is sealed into the supporter’s session. Your app can only ever learn about those accounts, and changing the
          targets means the supporter signs in again. In development, SDKs check once per process that each target exists and throw{" "}
          <code>invalid_config</code> if not (for example, a GitHub account without a Sponsors profile).
        </p>

        <H3 id="sessions">Sign-in &amp; sessions</H3>
        <p>
          The supporter signs in with GitHub or Open Collective through a Sponsorkit consent screen that names your targets and who
          is asking: the site’s origin for web apps, or the app name (labelled “says it is”) for native apps. How the result comes
          back depends on where your code runs:
        </p>
        <Table
          head={["Where", "Method", "What happens"]}
          rows={[
            ["Browser", "Popup", "signIn() from a click handler opens a popup; the code is posted back to your origin only."],
            ["Browser, popups blocked", "Redirect", <>With <code>returnTo</code> set, the page navigates and returns with a code.</>],
            ["CLI or desktop", "Loopback", "The SDK listens on 127.0.0.1 and opens the system browser."],
            ["SSH, containers, headless", "Paste-back", "The SDK prints a link; the user opens it anywhere and pastes back a code valid for 10 minutes."],
          ]}
        />
        <p>
          Every flow uses PKCE, so a stolen sign-in code is useless. The result is a <strong>session token</strong> (
          <code>sks_…</code>): an encrypted blob only Sponsorkit can read. The SDK stores it locally (<code>localStorage</code> or a
          per-user config directory with <code>0600</code> files). It lasts 180 days and renews itself on use. To check both
          providers, call <code>signIn({`{ provider: "opencollective" }`})</code> while signed in; the new identity is added to the
          same session.
        </p>
        <p>
          <code>signOut()</code> deletes the token and cache locally. Open Collective sign-ins expire after 90 days; the identity is
          then marked <code>needsReconnect</code>.
        </p>

        <H3 id="contributions">Contribution shape</H3>
        <p>The result is identical in every SDK. Amounts are in minor units (cents) and are never converted or summed.</p>
        <Code code={resultShape} lang="jsonc" title="ContributionResult" />
        <Code code={helpersSnippet} lang="ts" title="Helpers" />

        <H3 id="statuses">Statuses</H3>
        <Table
          head={["Status", "Meaning", "GitHub", "Open Collective"]}
          rows={[
            [<code key="s">active</code>, "Recurring and current", "recurring, isActive", "ACTIVE"],
            [<code key="s">paid</code>, "Completed one-time contribution", "isOneTimePayment", "PAID"],
            [<code key="s">paused</code>, "Recurring, paused", "—", "PAUSED"],
            [<code key="s">cancelled</code>, "Ended", "recurring, not active", "CANCELLED, EXPIRED"],
            [<code key="s">refunded</code>, "Refunded", "—", "REFUNDED"],
            [<code key="s">disputed</code>, "Charged back", "—", "DISPUTED"],
            [<code key="s">failed</code>, "Payment failed", "—", "ERROR, REJECTED"],
            [<code key="s">pending</code>, "Not settled yet, or unknown", "—", "NEW, PENDING, PROCESSING, …"],
          ]}
        />
        <p>
          GitHub reports pending cancellations only through webhooks, which Sponsorkit doesn’t use, so a GitHub sponsorship stays{" "}
          <code>active</code> until it actually ends. GitHub sponsorships paid through Patreon carry the <code>via_patreon</code> flag.
        </p>

        <H3 id="organizations">Organization sponsorships</H3>
        <p>
          If an organization the supporter belongs to sponsors you on GitHub, or an organization or collective they administer
          contributes on Open Collective, the contribution is returned with <code>via: &quot;organization&quot;</code> and{" "}
          <code>sponsor.type: &quot;organization&quot;</code>. Whether it counts is up to you. Private organization sponsorships may
          only be visible to organization admins.
        </p>
        <Code code={orgSnippet} lang="ts" />

        <H3 id="caching">Caching &amp; freshness</H3>
        <p>
          Sponsorkit has no database, so the SDK is the cache. Results are stored locally and served without a network call for{" "}
          <code>cacheTtl</code> seconds (default 3600, minimum 60). A cache miss is a live query to the provider with the
          supporter’s own token, which takes about 0.3–1 s. Live checks are limited to one per minute per session.
        </p>
        <Code code={cacheSnippet} lang="ts" />
        <p>
          <code>fromCache: true</code> means the whole result came from the local cache. <code>stale: true</code> means some
          provider couldn’t be reached and its contributions came from the cache instead.
        </p>

        <H3 id="checkout">Checkout</H3>
        <p>
          <code>openCheckout()</code> signs the supporter in first if needed (so the new contribution can be detected), then sends
          them to the provider that fits the requested amount, currency and frequency:
        </p>
        <ul>
          <li>
            <strong>Currency</strong> must match exactly: USD for GitHub, the collective’s currency for Open Collective.
          </li>
          <li>
            <strong>Frequency</strong> must be supported: monthly or one-time on GitHub; one-time, monthly or yearly on Open
            Collective.
          </li>
          <li>
            <strong>GitHub tiers:</strong> the cheapest tier at or above the amount is used, otherwise the highest. A listing with no
            tier for the frequency isn’t offered.
          </li>
        </ul>
        <p>
          If one provider fits, the supporter goes straight there; if both fit, they choose; disabled options show why. Payment
          happens on GitHub or Open Collective. Afterwards the SDK re-checks every 60 s until it sees a new or changed contribution
          or the timeout (default 10 minutes) passes, and resolves with <code>{`{ status: "contributed", contribution }`}</code> or{" "}
          <code>{`{ status: "unknown" }`}</code>.
        </p>
        <Code code={checkoutSnippet} lang="ts" />

        <H3 id="nag">Nag helper</H3>
        <p>
          A small helper for “please support this project” messages that respects users. It counts runs per <code>id</code> and is
          due when your predicate is true and either <code>every</code> runs have passed or <code>orEvery</code> (an ISO-8601
          duration) has elapsed since it was last shown.
        </p>
        <Code code={nagSnippet} lang="ts" />
        <p>
          <code>due()</code> always returns false when <code>SPONSORKIT_DISABLE</code>, <code>SPONSORKIT_NO_NAG</code> or{" "}
          <code>CI</code> is set, or when stdout/stderr isn’t a terminal (override with <code>{`{ force: true }`}</code>). It never
          triggers a sign-in.
        </p>

        <H3 id="mock-mode">Mock mode</H3>
        <p>
          For tests, demos and development. Mock mode never touches the network or disk, and results carry <code>mock: true</code>.{" "}
          <code>signIn()</code> and <code>openCheckout()</code> resolve immediately; checkout simulates a new contribution.
        </p>
        <Code code={mockSnippet} lang="ts" />
        <Code code={mockEnv} lang="bash" title="Environment variables" />

        <H3 id="backend-verification">Backend verification</H3>
        <p>
          Client-side checks can be patched out. When your backend needs a trustworthy answer, it doesn’t need a key: the frontend
          forwards its session token and the backend asks Sponsorkit. The token is sealed with a key only Sponsorkit has, so it
          can’t be forged, and <code>verifySession</code> checks that it was issued for your targets.
        </p>
        <Code code={verifySnippet} lang="ts" title="server.ts" />
        <p>Every SDK has an equivalent. Without an SDK, call the API directly and compare the returned <code>targets</code>:</p>
        <Code code={verifyCurl} lang="bash" />
        <p>
          Key your users on <code>supporter.id</code>: it’s stable for the same person and target set, and different for apps with
          different targets, so users can’t be correlated across apps.
        </p>

        <H3 id="error-contract">Error contract</H3>
        <p>Sponsorkit must never break your app. Every SDK behaves like this (enforced by a shared conformance suite):</p>
        <Table
          head={["Situation", "Behaviour"]}
          rows={[
            ["No targets, malformed target, or (in development) a target that doesn’t exist", <><strong>Throws</strong> <code>invalid_config</code>.</>],
            ["Not signed in", "Signed-out result, no network call."],
            [<code key="s">session_invalid</code>, "Clears the token and cache, returns the signed-out result."],
            ["One provider unavailable", <>Merges that provider’s cached contributions, <code key="c">stale: true</code>.</>],
            ["Network error, 5xx, rate limited", <>Returns the cache (<code key="c">fromCache: true, stale: true</code>), or an empty signed-in result. <strong>Never throws.</strong></>],
            [<code key="s">SPONSORKIT_DISABLE=1</code>, <>No network or disk. <code key="c">disabled: true</code>; sign-in and checkout reject with <code key="d">disabled</code>.</>],
            ["Popup blocked", <><code key="c">signIn</code> / <code key="o">openCheckout</code> reject with <code key="p">popup_blocked</code> unless the redirect fallback applies.</>],
          ]}
        />

        <H3 id="self-hosting">Self-hosting</H3>
        <p>
          Sponsorkit is one stateless Cloudflare Worker (Hono, so it also runs on Node and Bun) plus these static pages. There’s no
          database, cron or migration. You need a GitHub OAuth App, an Open Collective OAuth app, and a sealing key.
        </p>
        <Code code={selfHostSnippet} lang="bash" title="Deploy" />
        <Code code={selfHostClient} lang="ts" title="Point the SDK at it" />
        <p>
          Rotate sealing keys by adding a new key first in <code>SEALING_KEYS</code>; keep the old one for 180 days. Sessions are
          re-sealed with the new key as they renew, so nobody is signed out. Source: <a href={REPO_URL}>{REPO_URL.replace("https://", "")}</a>.
        </p>

        <H2 id="protocol">Wire protocol</H2>
        <p>
          The HTTP API, the browser pages and the sealed-token format are specified in the{" "}
          <a href={PROTOCOL_URL}>normative wire protocol</a>. The reasoning behind the design is in the{" "}
          <a href={SPEC_URL}>specification</a>. To build an SDK for another language, implement the protocol and pass the
          conformance suite in <code>sdks/conformance</code>.
        </p>
      </article>
    </div>
  );
}
