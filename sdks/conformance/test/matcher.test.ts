import { expect, test } from "bun:test";
import { match, matchRequests, substitute, type LoggedRequest } from "../src/matcher";

test("subset objects, exact arrays and scalars", () => {
  expect(match({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 2 } })).toEqual([]);
  expect(match({ a: [1, 2] }, { a: [1] })).toHaveLength(1);
  expect(match({ a: [{ x: 1, y: 2 }] }, { a: [{ x: 1 }] })).toEqual([]);
  expect(match("x", "y")).toHaveLength(1);
  expect(match(null, null)).toEqual([]);
});

test("operators", () => {
  expect(match({ a: 1, b: 2 }, { $exact: { a: 1, b: 2 } })).toEqual([]);
  expect(match({ a: 1, b: 2 }, { $exact: { a: 1 } })).toHaveLength(1);
  expect(match({ a: 1, u: undefined }, { $exact: { a: 1 } })).toEqual([]);
  expect(match("sks_abc", { $regex: "^sks_" })).toEqual([]);
  expect(match(5, { $regex: "5" })).toHaveLength(1);
  expect(match({}, { k: { $absent: true } })).toEqual([]);
  expect(match({ k: null }, { k: { $absent: true } })).toEqual([]);
  expect(match({ k: 0 }, { k: { $absent: true } })).toHaveLength(1);
  expect(match({ k: null }, { k: { $any: true } })).toEqual([]);
  expect(match({}, { k: { $any: true } })).toHaveLength(1);
  expect(match("2026-11-16T18:00:00.000Z", { $type: "datetime" })).toEqual([]);
  expect(match("2026-11-16", { $type: "datetime" })).toHaveLength(1);
  expect(match(3, { $type: "integer" })).toEqual([]);
  expect(match(3.5, { $type: "integer" })).toHaveLength(1);
  expect(match([1, 2], { $len: 2 })).toEqual([]);
  expect(match("b", { $oneOf: ["a", "b"] })).toEqual([]);
  expect(match({ a: 1 }, { $keys: ["a"] })).toEqual([]);
  expect(match("http://h:1/checkout?b=2&a=1", { $url: { base: "http://h:1/checkout", query: { $exact: { a: "1", b: "2" } } } })).toEqual([]);
  expect(match("http://h:1/checkout?a=1&c=3", { $url: { base: "http://h:1/checkout", query: { $exact: { a: "1" } } } })).toHaveLength(1);
  expect(match(1, { $bogus: 1 })).toHaveLength(1);
});

test("variable substitution is longest-name-first and leaves unknown names", () => {
  const vars = { $STORAGE_DIR: "/tmp/x", $STORAGE_FILE: "/tmp/x/h.json", $A: "1" };
  expect(substitute({ p: "$STORAGE_FILE", q: ["$STORAGE_DIR/y", "$UNKNOWN", "Bearer $A"] }, vars)).toEqual({
    p: "/tmp/x/h.json",
    q: ["/tmp/x/y", "$UNKNOWN", "Bearer 1"],
  });
});

test("request expectations", () => {
  const log: LoggedRequest[] = [
    { method: "GET", path: "/api/v1/targets", query: {}, headers: {} },
    { method: "GET", path: "/api/v1/contributions", query: {}, headers: { authorization: "Bearer t" } },
    { method: "GET", path: "/api/v1/contributions", query: {}, headers: { authorization: "Bearer t" } },
  ];
  expect(matchRequests(log, { calls: [{ method: "GET", path: "/api/v1/contributions", count: 2, headers: { authorization: "Bearer t" } }] })).toEqual([]);
  expect(matchRequests(log, { calls: [{ method: "GET", path: "/api/v1/contributions", count: 1 }] })).toHaveLength(1);
  expect(matchRequests(log, { calls: [] })).toHaveLength(2);
  expect(matchRequests(log, { exact: false, calls: [] })).toEqual([]);
  expect(matchRequests(log, { includeTargetsLookups: true, calls: [{ method: "GET", path: "/api/v1/contributions", min: 1 }] })).toEqual([
    "unexpected request GET /api/v1/targets",
  ]);
  expect(matchRequests(log, { calls: [{ method: "GET", path: "/api/v1/contributions", max: 1 }] })).toHaveLength(1);
});
