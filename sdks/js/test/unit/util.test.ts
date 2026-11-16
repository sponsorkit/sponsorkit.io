import { describe, expect, test } from "bun:test";
import fullResult from "@sponsorkit/conformance/fixtures/contribution-result.json";
import fixtureStorage from "@sponsorkit/conformance/fixtures/storage-file.json";
import { parseRetryAfter } from "../../src/http";
import { FinancialContribution } from "../../src/result";
import { parseStorageFile, serializeStorageFile } from "../../src/storage";
import type { ContributionResult } from "../../src/types";
import { durationMs, isEnvSet, normalizeBaseUrl, stableStringify } from "../../src/util";

describe("env flags (PROTOCOL §7)", () => {
  test.each([
    [undefined, false],
    ["", false],
    ["0", false],
    ["false", false],
    ["FALSE", false],
    ["1", true],
    ["true", true],
    ["yes", true],
  ])("%p -> %p", (value, expected) => expect(isEnvSet(value)).toBe(expected));
});

describe("durations", () => {
  test.each([
    ["PT2S", 2000],
    ["P7D", 7 * 86400_000],
    ["P1W", 7 * 86400_000],
    ["P1DT12H", 36 * 3600_000],
    ["PT1.5S", 1500],
    [90, 90_000],
  ])("%p", (input, ms) => expect(durationMs(input)).toBe(ms));
  test.each(["", "P", "PT", "7D", "P1X"])("rejects %p", (input) => expect(() => durationMs(input)).toThrow());
});

test("Retry-After parsing", () => {
  expect(parseRetryAfter("60", 0)).toBe(60_000);
  expect(parseRetryAfter(null, 0)).toBe(60_000);
  const now = Date.parse("2026-01-01T00:00:00Z");
  expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:30 GMT", now)).toBe(30_000);
});

test("apiBaseUrl normalization", () => {
  expect(normalizeBaseUrl("https://sponsorkit.io/")).toBe("https://sponsorkit.io");
  expect(normalizeBaseUrl("http://127.0.0.1:1234")).toBe("http://127.0.0.1:1234");
  expect(() => normalizeBaseUrl("ftp://x")).toThrow();
  expect(() => normalizeBaseUrl("nope")).toThrow();
});

test("stableStringify ignores key order", () => {
  expect(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(stableStringify({ a: [1, { c: 3, d: 2 }], b: 1 }));
});

describe("storage document (PROTOCOL §8)", () => {
  test("round-trips the fixture", () => {
    const parsed = parseStorageFile(JSON.stringify(fixtureStorage));
    expect(JSON.parse(serializeStorageFile(parsed))).toEqual(fixtureStorage);
  });
  test("drops malformed parts", () => {
    expect(parseStorageFile("not json")).toEqual({ v: 1 });
    expect(parseStorageFile(JSON.stringify({ v: 2, sessionToken: "sks_x" }))).toEqual({ v: 1 });
    expect(parseStorageFile(JSON.stringify({ v: 1, sessionToken: "bad", nags: { a: { runs: -1 }, b: { runs: 2, lastShown: "x" } } }))).toEqual({
      v: 1,
      nags: { b: { runs: 2, lastShown: null } },
    });
  });
  test("signed-out documents omit token and cache", () => {
    expect(JSON.parse(serializeStorageFile({ v: 1, sessionToken: null, cache: null, nags: { x: { runs: 1, lastShown: null } } }))).toEqual({
      v: 1,
      nags: { x: { runs: 1, lastShown: null } },
    });
  });
});

test("FinancialContribution serializes to the protocol shape", () => {
  const fc = new FinancialContribution(fullResult as ContributionResult);
  expect(JSON.parse(JSON.stringify(fc))).toEqual(fullResult);
  expect(fc.active().every((c) => c.status === "active")).toBe(true);
  expect(fc.byProvider("opencollective").every((c) => c.provider === "opencollective")).toBe(true);
  expect(fc.direct().every((c) => c.via === "direct")).toBe(true);
  expect(fc.recurring().length + fc.oneTime().length).toBe(fc.contributions.length);
});
