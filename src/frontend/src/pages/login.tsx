import { useRouter } from "next/router";
import { useEffect } from "react";
import { createMessage } from "../utils/window-messages";

export default function LoginPage() {
  const router = useRouter();

  useEffect(
    () => {
      const code = router.query.code as string;
      const state = router.query.state as string;
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
