import type { RateLimitBinding } from "./env";
import { ApiError } from "./errors";
import { describeError, logEvent } from "./log";

/** Every binding uses a 60 s period. */
export const RATE_LIMIT_PERIOD = 60;

/**
 * Returns true when the request may proceed. A missing binding is a no-op, and a binding
 * failure fails open (rate limiting is abuse protection, not a security boundary).
 */
export async function allow(binding: RateLimitBinding | undefined, key: string): Promise<boolean> {
  if (!binding) return true;
  try {
    const { success } = await binding.limit({ key });
    return success;
  } catch (e) {
    logEvent("warn", { msg: "ratelimit_error", error: describeError(e) });
    return true;
  }
}

export async function enforce(binding: RateLimitBinding | undefined, key: string): Promise<void> {
  if (!(await allow(binding, key))) throw new ApiError(429, "rate_limited", "Too many requests", RATE_LIMIT_PERIOD);
}

export function clientIp(req: Request): string {
  return req.headers.get("CF-Connecting-IP") ?? req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown";
}
