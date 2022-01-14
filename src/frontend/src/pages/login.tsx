import { useRouter } from "next/router";
import { useEffect } from "react";
import { createMessage } from "../utils/window-messages";

export default function LoginPage() {
  const router = useRouter();

  useEffect(
    () => {
      const uri = new URL(router.asPath);

      const code = uri.searchParams.get("code");
      const state = uri.searchParams.get("state");
      if (!code || !state)
        return;

      window.postMessage(
        createMessage("on-github-code", {
          code,
          state
        }),
        location.origin);
      window.close();
    });

  return null;
}
