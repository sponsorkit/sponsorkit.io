/** application/problem+json errors (PROTOCOL §3). */
import type { ErrorCode, Problem } from "@sponsorkit/shared";

const TITLES: Record<ErrorCode, string> = {
  invalid_request: "Invalid request",
  invalid_target: "Invalid target",
  invalid_code: "Invalid sign-in code",
  session_invalid: "Session invalid",
  rate_limited: "Too many requests",
  not_found: "Not found",
  internal: "Internal error",
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly detail?: string,
    readonly retryAfter?: number,
  ) {
    super(detail ?? code);
    this.name = "ApiError";
  }
}

/**
 * `type` must dereference to human-readable docs (RFC 9457 §3.1.1). The site has no per-code
 * errors page, so every problem points at the docs' error section; `code` tells them apart.
 */
export const PROBLEM_TYPE = "https://sponsorkit.io/docs#error-contract";

export function problemBody(status: number, code: ErrorCode, detail?: string): Problem {
  const body: Problem = {
    type: PROBLEM_TYPE,
    title: TITLES[code],
    status,
    code,
  };
  if (detail) body.detail = detail;
  return body;
}

export function problemResponse(err: ApiError): Response {
  const headers = new Headers({ "Content-Type": "application/problem+json", "Cache-Control": "no-store" });
  if (err.retryAfter !== undefined) headers.set("Retry-After", String(err.retryAfter));
  return new Response(JSON.stringify(problemBody(err.status, err.code, err.detail)), { status: err.status, headers });
}
