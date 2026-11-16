import { describe, expect, it } from "vitest";
import { checkoutContinueHref, errorMessage, normalizeContinue, parseDoneHash } from "./done";

const CODE = "skc_AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA";

describe("parseDoneHash (PROTOCOL §4.5)", () => {
  it("parses code + origin", () => {
    expect(parseDoneHash(`#code=${CODE}&origin=${encodeURIComponent("https://app.example.com")}`)).toEqual({
      kind: "code",
      code: CODE,
      origin: "https://app.example.com",
      continueQuery: null,
    });
  });

  it("parses continue", () => {
    const cont = encodeURIComponent("targets=github:octocat&amount=500");
    const s = parseDoneHash(`#code=${CODE}&origin=https%3A%2F%2Fa.example&continue=${cont}`);
    expect(s.kind === "code" && s.continueQuery).toBe("targets=github%3Aoctocat&amount=500");
    expect(s.kind === "code" && s.continueQuery && checkoutContinueHref(s.continueQuery)).toBe(
      "/checkout?targets=github%3Aoctocat&amount=500&step=choose",
    );
  });

  it("requires a valid origin with a code", () => {
    expect(parseDoneHash(`#code=${CODE}`).kind).toBe("invalid");
    expect(parseDoneHash(`#code=${CODE}&origin=*`).kind).toBe("invalid");
    expect(parseDoneHash(`#code=nope&origin=https%3A%2F%2Fa.example`).kind).toBe("invalid");
  });

  it("parses paste", () => {
    expect(parseDoneHash(`#paste=${CODE}`)).toEqual({ kind: "paste", code: CODE, continueQuery: null });
    expect(parseDoneHash(`#paste=<script>`).kind).toBe("invalid");
  });

  it("parses errors", () => {
    expect(parseDoneHash("#error=access_denied&origin=https%3A%2F%2Fa.example")).toEqual({
      kind: "error",
      error: "access_denied",
      origin: "https://a.example",
    });
    expect(parseDoneHash("#error=access_denied")).toEqual({ kind: "error", error: "access_denied", origin: null });
    expect(parseDoneHash("#error=%3Cb%3E")).toMatchObject({ error: "provider_error" });
  });

  it("handles an empty hash", () => {
    expect(parseDoneHash("")).toEqual({ kind: "empty" });
    expect(parseDoneHash("#")).toEqual({ kind: "empty" });
    expect(parseDoneHash("#foo=bar")).toEqual({ kind: "empty" });
  });
});

describe("normalizeContinue", () => {
  it("strips sign-in params and step", () => {
    expect(normalizeContinue("?targets=github:x&challenge=c&delivery=paste&origin=o&redirect_uri=r&step=choose")).toBe(
      "targets=github%3Ax",
    );
  });
  it("rejects values without targets or with a fragment", () => {
    expect(normalizeContinue("amount=5")).toBeNull();
    expect(normalizeContinue("targets=github:x#y")).toBeNull();
    expect(normalizeContinue("")).toBeNull();
    expect(normalizeContinue(null)).toBeNull();
  });
});

describe("errorMessage", () => {
  it("has copy for every protocol error and a fallback", () => {
    for (const c of ["access_denied", "invalid_state", "provider_error"]) expect(errorMessage(c).title).not.toBe("Sign-in failed");
    expect(errorMessage("weird").title).toBe("Sign-in failed");
  });
});
