/**
 * Reference implementation of the scenarios.json matcher language (README.md
 * "Matchers"). SDK test suites port this (it is ~100 lines in any language).
 */

export type Vars = Record<string, string>;

/**
 * Replace `$NAME` variables inside every string of `value`. Longest names are
 * substituted first so `$STORAGE_DIR` never clobbers `$STORAGE_FILE`.
 * Unknown `$NAME`s are left untouched.
 */
export function substitute<T>(value: T, vars: Vars): T {
  const names = Object.keys(vars).sort((a, b) => b.length - a.length);
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      let s = v;
      for (const n of names) s = s.split(n).join(vars[n]!);
      return s;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeOf(a) !== typeOf(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => deepEqual(x, (b as unknown[])[i]));
  if (a && typeof a === "object") {
    const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
    const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

function isOperator(m: unknown): m is Record<string, unknown> {
  return !!m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).some((k) => k.startsWith("$"));
}

/** Returns a list of mismatch descriptions; empty means the value matches. */
export function match(actual: unknown, expected: unknown, path = "$"): string[] {
  if (isOperator(expected)) {
    const errors: string[] = [];
    for (const [op, arg] of Object.entries(expected)) {
      switch (op) {
        case "$exact":
          if (!deepEqual(actual, arg)) errors.push(`${path}: expected exactly ${JSON.stringify(arg)}, got ${JSON.stringify(actual)}`);
          break;
        case "$regex":
          if (typeof actual !== "string" || !new RegExp(String(arg)).test(actual))
            errors.push(`${path}: ${JSON.stringify(actual)} does not match /${String(arg)}/`);
          break;
        case "$absent":
          if (arg === true && actual !== undefined && actual !== null) errors.push(`${path}: expected absent or null, got ${JSON.stringify(actual)}`);
          break;
        case "$any":
          if (arg === true && actual === undefined) errors.push(`${path}: expected a value`);
          break;
        case "$type": {
          const t = typeOf(actual);
          const ok =
            arg === "datetime"
              ? typeof actual === "string" && ISO_DATETIME.test(actual)
              : arg === "integer"
                ? Number.isInteger(actual)
                : t === arg;
          if (!ok) errors.push(`${path}: expected type ${String(arg)}, got ${JSON.stringify(actual)}`);
          break;
        }
        case "$len": {
          const len = Array.isArray(actual) || typeof actual === "string" ? actual.length : undefined;
          if (len !== arg) errors.push(`${path}: expected length ${String(arg)}, got ${String(len)}`);
          break;
        }
        case "$oneOf": {
          const options = arg as unknown[];
          if (!options.some((o) => match(actual, o, path).length === 0))
            errors.push(`${path}: ${JSON.stringify(actual)} matches none of ${JSON.stringify(options)}`);
          break;
        }
        case "$url": {
          const spec = arg as { base: string; query?: unknown };
          let u: URL;
          try {
            u = new URL(String(actual));
          } catch {
            errors.push(`${path}: ${JSON.stringify(actual)} is not a URL`);
            break;
          }
          const base = `${u.origin}${u.pathname}`;
          if (base !== spec.base) errors.push(`${path}: URL base ${base} !== ${spec.base}`);
          if (spec.query !== undefined) errors.push(...match(Object.fromEntries(u.searchParams), spec.query, `${path}?`));
          break;
        }
        case "$keys": {
          // Exact key set (ignoring undefined values); values are matched as a subset.
          const keys = actual && typeof actual === "object" ? Object.keys(actual).filter((k) => (actual as Record<string, unknown>)[k] !== undefined).sort() : [];
          const want = [...(arg as string[])].sort();
          if (JSON.stringify(keys) !== JSON.stringify(want)) errors.push(`${path}: keys ${JSON.stringify(keys)} !== ${JSON.stringify(want)}`);
          break;
        }
        default:
          errors.push(`${path}: unknown operator ${op}`);
      }
    }
    return errors;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path}: expected an array, got ${JSON.stringify(actual)}`];
    if (actual.length !== expected.length) return [`${path}: expected ${expected.length} items, got ${actual.length}`];
    return expected.flatMap((e, i) => match(actual[i], e, `${path}[${i}]`));
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return [`${path}: expected an object, got ${JSON.stringify(actual)}`];
    return Object.entries(expected).flatMap(([k, e]) => match((actual as Record<string, unknown>)[k], e, `${path}.${k}`));
  }
  return actual === expected ? [] : [`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`];
}

/** Request-log assertion (README "Request expectations"). */
export interface LoggedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
}

export interface RequestExpectationInput {
  exact?: boolean;
  includeTargetsLookups?: boolean;
  calls?: { method: string; path: string; count?: number; min?: number; max?: number; query?: unknown; headers?: unknown; body?: unknown }[];
}

export function matchRequests(log: LoggedRequest[], spec: RequestExpectationInput): string[] {
  const exact = spec.exact ?? true;
  const relevant = spec.includeTargetsLookups ? log : log.filter((r) => !(r.method === "GET" && r.path === "/api/v1/targets"));
  const errors: string[] = [];
  const matched = new Set<number>();
  for (const call of spec.calls ?? []) {
    const hits = relevant.filter((r, i) => {
      if (r.method !== call.method || r.path !== call.path) return false;
      const ok =
        (call.query === undefined || match(r.query, call.query).length === 0) &&
        (call.headers === undefined || match(r.headers, call.headers).length === 0) &&
        (call.body === undefined || match(r.body, call.body).length === 0);
      if (ok) matched.add(i);
      return ok;
    });
    const label = `${call.method} ${call.path}`;
    const n = hits.length;
    if (call.count !== undefined && n !== call.count) errors.push(`${label}: expected ${call.count} matching request(s), got ${n}`);
    if (call.min !== undefined && n < call.min) errors.push(`${label}: expected at least ${call.min}, got ${n}`);
    if (call.max !== undefined && n > call.max) errors.push(`${label}: expected at most ${call.max}, got ${n}`);
    if (call.count === undefined && call.min === undefined && call.max === undefined && n < 1) errors.push(`${label}: expected at least 1, got 0`);
  }
  if (exact) {
    relevant.forEach((r, i) => {
      if (!matched.has(i)) errors.push(`unexpected request ${r.method} ${r.path}`);
    });
  }
  return errors;
}
