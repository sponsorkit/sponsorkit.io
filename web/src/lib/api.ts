import { DEFAULT_API_BASE_URL, TargetsResponse, trimTrailingSlashes, type Target, type TargetInfo } from "@sponsorkit/shared";
import { targetsQuery } from "./params";

/**
 * Origin of the API (PROTOCOL §0.2): `NEXT_PUBLIC_SPONSORKIT_API_BASE`, inlined at build time,
 * defaulting to https://api.sponsorkit.io. An empty string means same origin (`/api/…`), for
 * single-origin self-hosting; `http://127.0.0.1:8787` talks to a local Worker.
 */
export function apiBase(): string {
  return trimTrailingSlashes(process.env.NEXT_PUBLIC_SPONSORKIT_API_BASE ?? DEFAULT_API_BASE_URL);
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
