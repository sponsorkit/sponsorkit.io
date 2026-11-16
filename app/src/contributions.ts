/** Building a live ContributionResult from a session (SPEC §5.3). */
import {
  targetsFromParam,
  type Contribution,
  type ContributionResult,
  type Identity,
  type Provider,
  type Target,
} from "@sponsorkit/shared";
import type { Env } from "./env";
import { supporterId } from "./ids";
import { describeError, logEvent } from "./log";
import type { SealedIdentity, SessionPayload } from "./payloads";
import { getAdapter, ProviderAuthError } from "./providers";
import { nowSeconds } from "./seal";

interface Job {
  identity: SealedIdentity;
  target: Target;
}

/**
 * Query every (identity × target of the same provider) in parallel. A failed provider is
 * listed in `unavailable` (with `stale: true`); a rejected/expired provider token also
 * marks its identity `needsReconnect`.
 */
export async function buildResult(env: Env, session: Pick<SessionPayload, "t" | "ids">, now = nowSeconds()): Promise<ContributionResult> {
  const targets = targetsFromParam(session.t);
  const jobs: Job[] = [];
  for (const identity of session.ids) {
    for (const target of targets) if (target.provider === identity.p) jobs.push({ identity, target });
  }

  const reconnect = new Set<Provider>();
  const unavailable = new Set<Provider>();
  const settled = await Promise.all(
    jobs.map(async ({ identity, target }): Promise<Contribution[]> => {
      if (identity.tx !== undefined && identity.tx <= now) {
        reconnect.add(identity.p);
        unavailable.add(identity.p);
        return [];
      }
      try {
        return await getAdapter(env, identity.p).fetchContributions(
          identity.tok,
          { id: identity.id, handle: identity.h },
          target,
        );
      } catch (e) {
        if (e instanceof ProviderAuthError) reconnect.add(identity.p);
        unavailable.add(identity.p);
        logEvent("warn", { msg: "provider_unavailable", provider: identity.p, error: describeError(e) });
        return [];
      }
    }),
  );

  const identities: Identity[] = session.ids.map((i) => ({
    provider: i.p,
    id: i.id,
    handle: i.h,
    needsReconnect: reconnect.has(i.p),
  }));
  const first = session.ids[0]!;
  const result: ContributionResult = {
    signedIn: true,
    disabled: false,
    mock: false,
    targets: targets.map((t) => `${t.provider}:${t.account}`),
    // The pairwise id is derived from the session's first (original sign-in) identity.
    supporter: { id: await supporterId(env, session.t, first.p, first.id), identities },
    contributions: settled.flat(),
    fetchedAt: new Date(now * 1000).toISOString(),
    stale: unavailable.size > 0,
    fromCache: false,
  };
  if (unavailable.size > 0) result.unavailable = [...unavailable].sort();
  return result;
}
