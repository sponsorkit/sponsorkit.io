"use client";

import { useCallback, useEffect, useState } from "react";
import type { Target, TargetInfo } from "@sponsorkit/shared";
import { ApiError, fetchTargets } from "@/lib/api";

export type TargetsState =
  | { status: "loading" }
  | { status: "ready"; infos: TargetInfo[] }
  | { status: "error"; message: string };

/** Loads `/api/v1/targets` for a target set (or waits while `targets` is null). */
export function useTargets(targets: Target[] | null): TargetsState & { retry: () => void } {
  const [state, setState] = useState<TargetsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const key = targets ? targets.map((t) => `${t.provider}:${t.account}`).join(",") : null;

  useEffect(() => {
    if (!targets) return;
    const ctrl = new AbortController();
    setState({ status: "loading" });
    fetchTargets(targets, ctrl.signal)
      .then((infos) => setState({ status: "ready", infos }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ status: "error", message: e instanceof ApiError ? e.message : "Couldn't load account details." });
      });
    return () => ctrl.abort();
    // `key` captures the target set; `targets` identity may change between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
