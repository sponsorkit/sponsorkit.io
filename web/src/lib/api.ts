import { TargetsResponse, type Target, type TargetInfo } from "@sponsorkit/shared";
import { targetsQuery } from "./params";

/**
 * Base URL for the Worker (`/api/*`). Same origin by default; `NEXT_PUBLIC_SPONSORKIT_API_BASE`
 * (an origin such as `http://127.0.0.1:8787`) overrides it for local development.
 */
export function apiBase(): string {
  const v = process.env.NEXT_PUBLIC_SPONSORKIT_API_BASE ?? "";
  return v.replace(/\/+$/, "");
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** `GET /api/v1/targets` (PROTOCOL §3.1), validated against the shared schema. */
export async function fetchTargets(targets: Target[], signal?: AbortSignal): Promise<TargetInfo[]> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/v1/targets?${targetsQuery(targets)}`, {
      headers: { Accept: "application/json" },
      ...(signal && { signal }),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("Couldn't reach Sponsorkit. Check your connection and try again.", null);
  }
  if (!res.ok) {
    throw new ApiError(
      res.status === 429 ? "Too many requests. Wait a moment and try again." : `Sponsorkit returned an error (${res.status}).`,
      res.status,
    );
  }
  const parsed = TargetsResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ApiError("Sponsorkit returned an unexpected response.", res.status);
  return parsed.data.targets;
}
