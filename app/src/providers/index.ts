import type { Provider } from "@sponsorkit/shared";
import type { Env } from "../env";
import { githubAdapter } from "./github";
import { opencollectiveAdapter } from "./opencollective";
import type { ProviderAdapter } from "./types";

export function getAdapter(env: Env, provider: Provider): ProviderAdapter {
  return provider === "github" ? githubAdapter(env) : opencollectiveAdapter(env);
}

export * from "./types";
