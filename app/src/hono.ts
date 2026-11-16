import type { Env } from "./env";

export interface AppEnv {
  Bindings: Env;
  Variables: { requestId: string };
}
