import { describe, expect, it } from "vitest";
import {
  buildContinue,
  buildStartUrl,
  isValidLoopbackUri,
  isValidOrigin,
  isValidRedirectUri,
  parseCheckoutParams,
  parseConnectParams,
  requesterOf,
  targetsQuery,
} from "./params";

const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

function qs(o: Record<string, string>): URLSearchParams {
  return new URLSearchParams(o);
}

describe("validators", () => {
  it("origins", () => {
    expect(isValidOrigin("https://app.example.com")).toBe(true);
    expect(isValidOrigin("http://localhost:5173")).toBe(true);
    expect(isValidOrigin("https://app.example.com/")).toBe(false);
    expect(isValidOrigin("https://app.example.com/path")).toBe(false);
    expect(isValidOrigin("javascript:alert(1)")).toBe(false);
    expect(isValidOrigin("*")).toBe(false);
    expect(isValidOrigin("null")).toBe(false);
  });
  it("redirect URIs", () => {
    expect(isValidRedirectUri("https://app.example.com/after?x=1")).toBe(true);
    expect(isValidRedirectUri("http://localhost:3000/cb")).toBe(true);
    expect(isValidRedirectUri("http://127.0.0.1/cb")).toBe(true);
    expect(isValidRedirectUri("http://example.com/cb")).toBe(false);
    expect(isValidRedirectUri("https://a.example/cb#frag")).toBe(false);
    expect(isValidRedirectUri("https://user:pw@a.example/cb")).toBe(false);
    expect(isValidRedirectUri("myapp://cb")).toBe(false);
  });
  it("loopback URIs", () => {
    expect(isValidLoopbackUri("http://127.0.0.1:49152/callback")).toBe(true);
    expect(isValidLoopbackUri("http://[::1]:8080/callback")).toBe(true);
    expect(isValidLoopbackUri("http://127.0.0.1/callback")).toBe(false);
    expect(isValidLoopbackUri("http://localhost:8080/callback")).toBe(false);
    expect(isValidLoopbackUri("http://127.0.0.1:8080/callback/")).toBe(false);
    expect(isValidLoopbackUri("http://127.0.0.1:70000/callback")).toBe(false);
    expect(isValidLoopbackUri("http://127.0.0.1:080/callback")).toBe(false);
  });
});

describe("parseConnectParams (PROTOCOL §4.1)", () => {
  it("parses a web_message request and canonicalizes targets", () => {
    const r = parseConnectParams(
      qs({ targets: "opencollective:Sponsorkit,github:Octocat", challenge: CHALLENGE, delivery: "web_message", origin: "https://app.example.com" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.targetsParam).toBe("github:octocat,opencollective:sponsorkit");
    expect(r.value.origin).toBe("https://app.example.com");
    expect(r.value.add).toBe(false);
    expect(requesterOf(r.value)).toEqual({ kind: "web", origin: "https://app.example.com" });
  });

  it("requires origin for web_message", () => {
    const r = parseConnectParams(qs({ targets: "github:octocat", challenge: CHALLENGE, delivery: "web_message" }));
    expect(r.ok).toBe(false);
  });

  it("requires a valid challenge", () => {
    expect(parseConnectParams(qs({ targets: "github:octocat", delivery: "paste" })).ok).toBe(false);
    expect(parseConnectParams(qs({ targets: "github:octocat", challenge: "short", delivery: "paste" })).ok).toBe(false);
  });

  it("rejects bad targets, unknown deliveries and too many targets per provider", () => {
    expect(parseConnectParams(qs({ challenge: CHALLENGE, delivery: "paste" })).ok).toBe(false);
    expect(parseConnectParams(qs({ targets: "github:-bad", challenge: CHALLENGE, delivery: "paste" })).ok).toBe(false);
    expect(parseConnectParams(qs({ targets: "github:a,github:b", challenge: CHALLENGE, delivery: "paste" })).ok).toBe(false);
    expect(parseConnectParams(qs({ targets: "github:a", challenge: CHALLENGE, delivery: "email" })).ok).toBe(false);
  });

  it("parses redirect delivery and shows the host", () => {
    const r = parseConnectParams(
      qs({ targets: "github:octocat", challenge: CHALLENGE, delivery: "redirect", redirect_uri: "https://app.example.com:8443/back" }),
    );
    expect(r.ok && requesterOf(r.value)).toEqual({ kind: "redirect", host: "app.example.com:8443" });
    expect(parseConnectParams(qs({ targets: "github:octocat", challenge: CHALLENGE, delivery: "redirect", redirect_uri: "http://evil.example/" })).ok).toBe(false);
  });

  it("parses loopback with app_name as 'says it is'", () => {
    const r = parseConnectParams(
      qs({ targets: "github:octocat", challenge: CHALLENGE, delivery: "loopback", redirect_uri: "http://127.0.0.1:5000/callback", app_name: " my-cli " }),
    );
    expect(r.ok && requesterOf(r.value)).toEqual({ kind: "native", appName: "my-cli", delivery: "loopback" });
    expect(parseConnectParams(qs({ targets: "github:octocat", challenge: CHALLENGE, delivery: "loopback", redirect_uri: "https://x.example/callback" })).ok).toBe(false);
  });

  it("limits app_name", () => {
    const base = { targets: "github:octocat", challenge: CHALLENGE, delivery: "paste" };
    expect(parseConnectParams(qs({ ...base, app_name: "x".repeat(64) })).ok).toBe(true);
    expect(parseConnectParams(qs({ ...base, app_name: "x".repeat(65) })).ok).toBe(false);
    expect(parseConnectParams(qs({ ...base, app_name: "evil‮ppa" })).ok).toBe(false);
    const r = parseConnectParams(qs(base));
    expect(r.ok && requesterOf(r.value)).toEqual({ kind: "native", appName: null, delivery: "paste" });
  });

  it("checks provider is in the target set", () => {
    const base = { targets: "github:octocat", challenge: CHALLENGE, delivery: "paste" };
    expect(parseConnectParams(qs({ ...base, provider: "github" })).ok).toBe(true);
    expect(parseConnectParams(qs({ ...base, provider: "opencollective" })).ok).toBe(false);
    expect(parseConnectParams(qs({ ...base, provider: "patreon" })).ok).toBe(false);
  });

  it("ignores origin for non-web deliveries", () => {
    const r = parseConnectParams(qs({ targets: "github:octocat", challenge: CHALLENGE, delivery: "paste", origin: "https://x.example", add: "1" }));
    expect(r.ok && r.value.origin).toBeUndefined();
    expect(r.ok && r.value.add).toBe(true);
  });
});

describe("buildStartUrl", () => {
  it("forwards the same params to /api/oauth/<provider>/start", () => {
    const r = parseConnectParams(
      qs({ targets: "github:octocat", challenge: CHALLENGE, delivery: "web_message", origin: "https://app.example.com", add: "1" }),
    );
    if (!r.ok) throw new Error("parse failed");
    const url = new URL(buildStartUrl("", "github", r.value), "https://sponsorkit.io");
    expect(url.pathname).toBe("/api/oauth/github/start");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      targets: "github:octocat",
      challenge: CHALLENGE,
      delivery: "web_message",
      origin: "https://app.example.com",
      add: "1",
    });
    expect(buildStartUrl("http://127.0.0.1:8787", "github", r.value, "targets=x")).toMatch(
      /^http:\/\/127\.0\.0\.1:8787\/api\/oauth\/github\/start\?.*&continue=targets%3Dx$/,
    );
  });
});

describe("parseCheckoutParams (PROTOCOL §4.6)", () => {
  it("parses an anonymous link", () => {
    const r = parseCheckoutParams(qs({ targets: "github:octocat", amount: "500", currency: "usd", frequency: "monthly" }));
    expect(r).toMatchObject({ ok: true, value: { signIn: null, amount: 500, currency: "USD", frequency: "monthly" } });
  });

  it("requires sign-in when a challenge is present and step is not choose", () => {
    const r = parseCheckoutParams(
      qs({ targets: "github:octocat", challenge: CHALLENGE, delivery: "web_message", origin: "https://app.example.com", amount: "500" }),
    );
    expect(r.ok && r.value.signIn?.delivery).toBe("web_message");
    expect(r.ok && r.value.origin).toBe("https://app.example.com");
  });

  it("skips sign-in on step=choose", () => {
    const r = parseCheckoutParams(qs({ targets: "github:octocat", challenge: CHALLENGE, step: "choose" }));
    expect(r.ok && r.value.signIn).toBeNull();
    expect(r.ok && r.value.step).toBe("choose");
  });

  it("rejects malformed options", () => {
    const cases: Record<string, string>[] = [{ amount: "5.00" },{ amount: "-1" }, { amount: "0" }, { currency: "dollars" }, { frequency: "weekly" }, { step: "pay" }];
    for (const bad of cases) {
      expect(parseCheckoutParams(qs({ targets: "github:octocat", ...bad })).ok).toBe(false);
    }
  });

  it("rejects an invalid sign-in request", () => {
    expect(parseCheckoutParams(qs({ targets: "github:octocat", challenge: CHALLENGE, delivery: "web_message" })).ok).toBe(false);
  });

  it("builds continue without sign-in params", () => {
    const r = parseCheckoutParams(
      qs({
        targets: "opencollective:sponsorkit,github:octocat",
        challenge: CHALLENGE,
        delivery: "paste",
        app_name: "my cli",
        amount: "500",
        currency: "EUR",
        frequency: "yearly",
        provider: "opencollective",
      }),
    );
    if (!r.ok) throw new Error("parse failed");
    const cont = new URLSearchParams(buildContinue(r.value));
    expect(Object.fromEntries(cont)).toEqual({
      targets: "github:octocat,opencollective:sponsorkit",
      amount: "500",
      currency: "EUR",
      frequency: "yearly",
      provider: "opencollective",
      app_name: "my cli",
    });
  });
});

describe("targetsQuery", () => {
  it("maps targets to /api/v1/targets params", () => {
    const r = parseCheckoutParams(qs({ targets: "github:octocat,opencollective:sponsorkit" }));
    if (!r.ok) throw new Error("parse failed");
    expect(targetsQuery(r.value.targets)).toBe("github=octocat&opencollective=sponsorkit");
  });
});
