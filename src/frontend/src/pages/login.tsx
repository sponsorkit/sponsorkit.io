import { useEffect } from "react";
import { useParams } from "@reach/router";
import { RouteComponentProps } from "@reach/router";

export default function LoginPage(props: RouteComponentProps<{}>) {
  useEffect(
    () => {
      if(!props.location)
        return;

      const uri = new URL(props.location.href);

      const code = uri.searchParams.get("code");
      const state = uri.searchParams.get("state");
      if(!code || !state)
        return;
      
      window.postMessage(
          {
              type: "sponsorkit",
              code,
              state
          }, 
          location.origin);
      window.close();
    });
  
  return null;
}
