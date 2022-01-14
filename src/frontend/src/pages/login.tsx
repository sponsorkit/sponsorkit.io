import { useEffect } from "react";
import { createMessage } from "../utils/window-messages";

export default function LoginPage(props: RouteComponentProps<{}>) {
  useEffect(
    () => {
      if (!props.location)
        return;

      const uri = new URL(props.location.href);

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
