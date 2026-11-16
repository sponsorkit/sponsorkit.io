"use client";

import { useEffect, useState } from "react";
import { parseConnectParams, type ParseResult, type SignInParams } from "@/lib/params";
import { Consent, InvalidLink, Loading } from "./consent";
import { useTargets } from "./use-targets";

/** `/connect` (PROTOCOL §4.2). */
export function ConnectClient() {
  const [parsed, setParsed] = useState<ParseResult<SignInParams> | null>(null);

  useEffect(() => {
    setParsed(parseConnectParams(new URLSearchParams(window.location.search)));
  }, []);

  const targetsState = useTargets(parsed?.ok ? parsed.value.targets : null);

  if (!parsed) return <Loading label="Loading…" />;
  if (!parsed.ok) return <InvalidLink errors={parsed.errors} />;
  return <Consent params={parsed.value} targetsState={targetsState} />;
}
