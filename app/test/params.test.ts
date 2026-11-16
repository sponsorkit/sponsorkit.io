import { describe, expect, it } from "vitest";
import { isValidLoopbackRedirect, isValidOrigin, isValidRedirectUri, parseStartParams, ParamError } from "../src/params";
import { CHALLENGE } from "./helpers";

const q = (o: Record<string, string>) => new URLSearchParams(o);

describe("redirect/origin rules (PROTOCOL §4.1)", () => {
  it("loopback: exactly http://127.0.0.1:<port>/callback or http://[::1]:<port>/callback", () => {
    expect(isValidLoopbackRedirect("http://127.0.0.1:53682/callback")).toBe(true);
    expect(isValidLoopbackRedirect("http://[::1]:8080/callback")).toBe(true);
    for (const bad of [
      "http://localhost:53682/callback",
      "http://127.0.0.1/callback",
      "http://127.0.0.1:53682/callback/",
      "http://127.0.0.1:53682/callback?x=1",
      "https://127.0.0.1:53682/callback",
      "http://127.0.0.1:0/callback",
      "http://127.0.0.1:65536/callback",
      "http://127.0.0.1:080/callback",
      "http://127.0.0.1:53682/other",
      "http://127.0.0.1.evil.com:53682/callback",
    ]) {
      expect(isValidLoopbackRedirect(bad), bad).toBe(false);
    }
  });

  it("redirect: https anywhere, http only on localhost/127.0.0.1", () => {
    expect(isValidRedirectUri("https://app.example.com/after?x=1")).toBe(true);
    expect(isValidRedirectUri("http://localhost:3000/cb")).toBe(true);
    expect(isValidRedirectUri("http://127.0.0.1/cb")).toBe(true);
    for (const bad of [
      "http://app.example.com/cb",
      "javascript:alert(1)",
      "https://user:pw@app.example.com/",
      "https://app.example.com/#frag",
      "ftp://x/",
      "not a url",
      "http://localhost.evil.com/",
    ]) {
      expect(isValidRedirectUri(bad), bad).toBe(false);
    }
  });

  it("origin: bare https origin or http loopback", () => {
    expect(isValidOrigin("https://app.example.com")).toBe(true);
    expect(isValidOrigin("https://app.example.com:8443")).toBe(true);
    expect(isValidOrigin("http://localhost:5173")).toBe(true);
    for (const bad of ["https://app.example.com/", "https://app.example.com/path", "http://app.example.com", "null", "*"]) {
      expect(isValidOrigin(bad), bad).toBe(false);
    }
  });
});

describe("parseStartParams", () => {
  const base = { targets: "opencollective:Sponsorkit,github:MathiasLorenzen", challenge: CHALLENGE };

  it("canonicalizes targets and keeps only delivery-relevant params", () => {
    const p = parseStartParams(
      q({ ...base, delivery: "web_message", origin: "https://app.example.com", redirect_uri: "https://ignored.example.com", app_name: "my-cli" }),
      "github",
    );
    expect(p.targetParam).toBe("github:mathiaslorenzen,opencollective:sponsorkit");
    expect(p.origin).toBe("https://app.example.com");
    expect(p.redirectUri).toBeUndefined();
    expect(p.appName).toBe("my-cli");
  });

  it("validates each delivery", () => {
    expect(parseStartParams(q({ ...base, delivery: "paste" }), "opencollective").delivery).toBe("paste");
    expect(parseStartParams(q({ ...base, delivery: "loopback", redirect_uri: "http://127.0.0.1:4000/callback" }), "github").redirectUri).toBe(
      "http://127.0.0.1:4000/callback",
    );
    expect(() => parseStartParams(q({ ...base, delivery: "loopback", redirect_uri: "http://localhost:4000/callback" }), "github")).toThrow(ParamError);
    expect(() => parseStartParams(q({ ...base, delivery: "redirect", redirect_uri: "http://evil.com/" }), "github")).toThrow(ParamError);
    expect(() => parseStartParams(q({ ...base, delivery: "web_message" }), "github")).toThrow(/origin/);
    expect(() => parseStartParams(q({ ...base, delivery: "carrier_pigeon" }), "github")).toThrow(ParamError);
  });

  it("rejects bad targets, missing challenge, provider outside the set", () => {
    expect(() => parseStartParams(q({ targets: "github:-bad", challenge: CHALLENGE, delivery: "paste" }), "github")).toThrow(ParamError);
    expect(() => parseStartParams(q({ targets: "github:a,github:b", challenge: CHALLENGE, delivery: "paste" }), "github")).toThrow(ParamError);
    expect(() => parseStartParams(q({ targets: "patreon:x", challenge: CHALLENGE, delivery: "paste" }), "github")).toThrow(ParamError);
    expect(() => parseStartParams(q({ targets: "github:a", delivery: "paste" }), "github")).toThrow(/challenge/);
    expect(() => parseStartParams(q({ targets: "github:a", challenge: "short", delivery: "paste" }), "github")).toThrow(ParamError);
    expect(() => parseStartParams(q({ targets: "github:a", challenge: CHALLENGE, delivery: "paste" }), "opencollective")).toThrow(/not in the target set/);
    expect(() => parseStartParams(q({ targets: "github:a", challenge: CHALLENGE, delivery: "paste", provider: "opencollective" }), "github")).toThrow(ParamError);
  });

  it("validates app_name and continue", () => {
    expect(() => parseStartParams(q({ ...base, delivery: "paste", app_name: "x".repeat(65) }), "github")).toThrow(/app_name/);
    expect(() => parseStartParams(q({ ...base, delivery: "paste", app_name: "bad\u0007name" }), "github")).toThrow(/app_name/);
    expect(parseStartParams(q({ ...base, delivery: "paste", continue: "targets=github%3Ax&amount=500" }), "github").continueValue).toBe(
      "targets=github%3Ax&amount=500",
    );
    expect(() => parseStartParams(q({ ...base, delivery: "paste", continue: "a=1#x" }), "github")).toThrow(/continue/);
  });
});
