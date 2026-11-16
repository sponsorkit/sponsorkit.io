/**
 * Structured JSON logging. Callers must never pass tokens, codes, state values, session
 * tokens or identities; `logEvent` additionally drops keys that look sensitive.
 */
const SENSITIVE = /token|code|state|secret|authorization|cookie|verifier|challenge|nonce|identity|tok$/i;

export type LogLevel = "info" | "warn" | "error";

export function logEvent(level: LogLevel, fields: Record<string, unknown>): void {
  const clean: Record<string, unknown> = { level, ts: new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) {
    if (k !== "msg" && SENSITIVE.test(k)) continue;
    clean[k] = v;
  }
  const line = JSON.stringify(clean);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Error description safe for logs: class name + message (our messages never embed secrets). */
export function describeError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return "non-error thrown";
}
