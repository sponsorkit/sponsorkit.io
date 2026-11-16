import Link from "next/link";
import type { ReactNode } from "react";
import { Code } from "@/components/code";
import { PROTOCOL_URL } from "@/components/chrome";
import { CheckIcon, GitHubIcon, HeartIcon, OpenCollectiveIcon } from "@/components/icons";
import { heroSnippet, languages, quickstart } from "@/content/snippets";

const faqs: { q: string; a: ReactNode }[] = [
  {
    q: "Do I need an account, API key or webhook?",
    a: (
      <p>
        No. You pass the GitHub login or Open Collective slug you receive sponsorships on, and that’s it. There’s no dashboard, no
        key and no callback URL to register.
      </p>
    ),
  },
  {
    q: "Does Sponsorkit take a cut or handle payments?",
    a: (
      <p>
        No. Supporters pay on GitHub Sponsors or Open Collective, exactly as they would without Sponsorkit. Sponsorkit never sees
        money or payment details.
      </p>
    ),
  },
  {
    q: "What does the supporter have to do?",
    a: (
      <p>
        Sign in once with GitHub or Open Collective from your app. They see a consent screen that names exactly which accounts
        you’ll check. After that, your app can ask whenever it likes.
      </p>
    ),
  },
  {
    q: "Can users fake being a sponsor?",
    a: (
      <p>
        Anything checked only on the user’s machine can be patched out; that’s true of every client-side check. If you need a
        trustworthy answer, send the session token to your backend and call <code>verifySession</code>. The token is sealed with
        a key only Sponsorkit has, so it can’t be forged.
      </p>
    ),
  },
  {
    q: "What happens if Sponsorkit or a provider is down?",
    a: (
      <p>
        Your app keeps working. SDKs never throw because of the network: they return the last cached result marked{" "}
        <code>stale</code>, or an empty signed-in result if there’s no cache yet.
      </p>
    ),
  },
  {
    q: "Do sponsorships through an organization count?",
    a: (
      <p>
        They’re always returned, marked <code>via: &quot;organization&quot;</code>. You decide whether they count;{" "}
        <code>fc.direct()</code> filters them out.
      </p>
    ),
  },
  {
    q: "Can I run it myself?",
    a: (
      <p>
        Yes. Sponsorkit is a single stateless Cloudflare Worker with no database. Bring your own OAuth apps and point the SDK at
        it with <code>apiBaseUrl</code>. See <Link href="/docs#self-hosting">self-hosting</Link>.
      </p>
    ),
  },
];

export default function Home() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">
              <HeartIcon size={14} /> For open source maintainers
            </span>
            <h1 id="hero-title">Sponsorships, built into your software.</h1>
            <p className="lede">
              Ask whether the current user sponsors you on GitHub Sponsors or Open Collective, then decide what that means: hide
              an ad, skip a nag, unlock a feature. No account, no API key, no stored data.
            </p>
            <div className="cta-row">
              <Link className="btn" href="/docs">
                Get started
              </Link>
              <a className="btn btn-secondary" href="#how-it-works">
                How it works
              </a>
            </div>
          </div>
          <div>
            <Code code={heroSnippet} lang="ts" title="app.ts" />
          </div>
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="quickstart-title">
        <div className="container">
          <div className="section-head">
            <h2 id="quickstart-title">A three-line quickstart</h2>
            <p>Install the SDK, name the account you receive sponsorships on, and ask. That is the whole integration.</p>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))" }}>
            <div>
              <Code code={quickstart.install} lang="bash" title="Terminal" />
            </div>
            <div>
              <Code code={quickstart.code} lang="ts" title="app.ts" />
            </div>
          </div>
          <div className="tag-row" aria-label="Available SDKs">
            {languages.map((l) => (
              <Link key={l.id} className="lang-tag" href={`/docs#quickstart-${l.id}`}>
                {l.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="how-it-works" aria-labelledby="how-title">
        <div className="container">
          <div className="section-head">
            <h2 id="how-title">How it works</h2>
            <p>Sponsorkit reports facts. Your code decides what to do with them.</p>
          </div>
          <ol className="steps">
            <li>
              <strong>Name your accounts</strong>
              <span>Pass your GitHub login and/or Open Collective slug to the SDK. Nothing to register.</span>
            </li>
            <li>
              <strong>Supporter signs in once</strong>
              <span>A consent screen shows exactly which accounts are checked. Works in browsers, CLIs and over SSH.</span>
            </li>
            <li>
              <strong>Ask any time</strong>
              <span>
                <code>getFinancialContribution()</code> returns amount, frequency and status per provider, cached locally.
              </span>
            </li>
            <li>
              <strong>Invite them to contribute</strong>
              <span>
                <code>openCheckout()</code> sends them to the right provider and notices the new contribution.
              </span>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="providers-title">
        <div className="container">
          <div className="section-head">
            <h2 id="providers-title">Providers</h2>
            <p>Use one or both. Contributions are reported per provider and never summed or converted.</p>
          </div>
          <div className="provider-cards">
            <article className="card provider-card">
              <span className="logo">
                <GitHubIcon size={24} />
              </span>
              <div>
                <h3>GitHub Sponsors</h3>
                <p>Users and organizations, including sponsorships paid by an organization the supporter belongs to.</p>
                <ul>
                  <li>Monthly and one-time</li>
                  <li>Tier-based amounts, in USD</li>
                </ul>
              </div>
            </article>
            <article className="card provider-card">
              <span className="logo">
                <OpenCollectiveIcon size={24} />
              </span>
              <div>
                <h3>Open Collective</h3>
                <p>Any collective, including contributions from organizations or collectives the supporter administers.</p>
                <ul>
                  <li>One-time, monthly and yearly</li>
                  <li>Any amount, in the collective’s currency</li>
                </ul>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="privacy-title">
        <div className="container hero-grid" style={{ alignItems: "start" }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <h2 id="privacy-title">Nothing stored. Nothing to leak.</h2>
            <p>
              Sponsorkit is a single stateless Worker with no database. Everything a request needs travels in an encrypted session
              token that only the Worker can read, held by your app.
            </p>
            <p>
              <a href={PROTOCOL_URL}>Read the wire protocol</a>
            </p>
          </div>
          <ul className="check-list">
            {[
              "No database, no accounts, no analytics, no cookies beyond a 10-minute sign-in nonce.",
              "Supporters see exactly which accounts are checked before they sign in.",
              "Your app only ever learns about the accounts you named, never anything else.",
              "Supporter ids are pairwise: apps with different accounts can’t correlate users.",
              "Provider tokens never leave the Worker in readable form.",
              "Sign-out is local. Revoking access at GitHub or Open Collective ends it everywhere.",
            ].map((t) => (
              <li key={t}>
                <CheckIcon size={18} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="faq-title">
        <div className="container faq" style={{ maxWidth: "52rem" }}>
          <h2 id="faq-title">Questions</h2>
          {faqs.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <div>{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="cta-title">
        <div className="container" style={{ textAlign: "center" }}>
          <h2 id="cta-title">Ready when you are.</h2>
          <p className="muted">JavaScript/TypeScript, .NET, Python, Go and Rust SDKs with the same behaviour everywhere.</p>
          <div className="cta-row" style={{ justifyContent: "center" }}>
            <Link className="btn" href="/docs">
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
